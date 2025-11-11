-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'vendedor',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, 'vendedor');
  
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create pipelines table
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

-- Create stages table
CREATE TABLE public.stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(pipeline_id, position)
);

ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;

-- Create enum for field types
CREATE TYPE public.field_type AS ENUM ('text', 'number', 'date', 'select');

-- Create custom_fields table
CREATE TABLE public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type field_type NOT NULL,
  options JSONB,
  is_required BOOLEAN DEFAULT false,
  position INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

-- Create deals table
CREATE TABLE public.deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.stages(id),
  title TEXT NOT NULL,
  value DECIMAL(12, 2),
  owner_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- Create deal_field_values table
CREATE TABLE public.deal_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(deal_id, field_id)
);

ALTER TABLE public.deal_field_values ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- user_roles policies
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- pipelines policies
CREATE POLICY "Authenticated users can view pipelines"
  ON public.pipelines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage pipelines"
  ON public.pipelines FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- stages policies
CREATE POLICY "Authenticated users can view stages"
  ON public.stages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage stages"
  ON public.stages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- custom_fields policies
CREATE POLICY "Authenticated users can view fields"
  ON public.custom_fields FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage fields"
  ON public.custom_fields FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- deals policies
CREATE POLICY "Users can view all deals"
  ON public.deals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create deals"
  ON public.deals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own deals"
  ON public.deals FOR UPDATE
  TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Admins can manage all deals"
  ON public.deals FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- deal_field_values policies
CREATE POLICY "Users can view field values"
  ON public.deal_field_values FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Deal owners can manage field values"
  ON public.deal_field_values FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = deal_field_values.deal_id
      AND deals.owner_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all field values"
  ON public.deal_field_values FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));