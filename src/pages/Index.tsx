import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import StageColumn from '@/components/StageColumn';
import DealCard from '@/components/DealCard';
import { Button } from '@/components/ui/button';
import { Plus, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Stage {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface CustomField {
  id: string;
  stage_id: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'select';
  options?: any;
  is_required: boolean;
  position: number;
}

interface Deal {
  id: string;
  title: string;
  value?: number;
  stage_id: string;
  owner_id: string;
  profiles?: {
    full_name?: string;
  };
}

interface DealFieldValue {
  field_id: string;
  value: string;
}

const Index = () => {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [pipeline, setPipeline] = useState<any>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealFieldValues, setDealFieldValues] = useState<Record<string, DealFieldValue[]>>({});
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string>('');
  
  const [newDeal, setNewDeal] = useState({
    title: '',
    value: '',
    stage_id: '',
  });

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  // Fetch pipeline data
  useEffect(() => {
    if (user) {
      fetchPipelineData();
    }
  }, [user]);

  const fetchPipelineData = async () => {
    try {
      // Fetch pipeline
      const { data: pipelineData, error: pipelineError } = await supabase
        .from('pipelines')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (pipelineError) throw pipelineError;

      if (!pipelineData) {
        // No pipeline exists
        if (role === 'admin') {
          toast({
            title: 'Configure o pipeline',
            description: 'Você precisa configurar as etapas do funil primeiro.',
            variant: 'default',
          });
          navigate('/admin');
        }
        return;
      }

      setPipeline(pipelineData);

      // Fetch stages
      const { data: stagesData, error: stagesError } = await supabase
        .from('stages')
        .select('*')
        .eq('pipeline_id', pipelineData.id)
        .order('position', { ascending: true });

      if (stagesError) throw stagesError;
      setStages(stagesData || []);

      // Fetch custom fields
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('custom_fields')
        .select('*')
        .in('stage_id', (stagesData || []).map(s => s.id))
        .order('position', { ascending: true });

      if (fieldsError) throw fieldsError;
      setCustomFields(fieldsData || []);

      // Fetch deals
      const { data: dealsData, error: dealsError } = await supabase
        .from('deals')
        .select('*')
        .eq('pipeline_id', pipelineData.id);

      if (dealsError) throw dealsError;

      // Fetch profiles for deal owners
      if (dealsData && dealsData.length > 0) {
        const ownerIds = [...new Set(dealsData.map(d => d.owner_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ownerIds);

        const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
        const dealsWithProfiles = dealsData.map(deal => ({
          ...deal,
          profiles: profilesMap.get(deal.owner_id),
        }));
        setDeals(dealsWithProfiles);
      } else {
        setDeals([]);
      }

      // Fetch deal field values
      if (dealsData && dealsData.length > 0) {
        const { data: valuesData, error: valuesError } = await supabase
          .from('deal_field_values')
          .select('*')
          .in('deal_id', dealsData.map(d => d.id));

        if (valuesError) throw valuesError;

        // Group by deal_id
        const valuesByDeal: Record<string, DealFieldValue[]> = {};
        (valuesData || []).forEach(v => {
          if (!valuesByDeal[v.deal_id]) {
            valuesByDeal[v.deal_id] = [];
          }
          valuesByDeal[v.deal_id].push({
            field_id: v.field_id,
            value: v.value,
          });
        });
        setDealFieldValues(valuesByDeal);
      }
    } catch (error: any) {
      console.error('Error fetching pipeline data:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleCreateDeal = async () => {
    if (!user || !pipeline || !newDeal.title || !newDeal.stage_id) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Título e etapa são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('deals')
        .insert({
          pipeline_id: pipeline.id,
          stage_id: newDeal.stage_id,
          title: newDeal.title,
          value: newDeal.value ? parseFloat(newDeal.value) : null,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Negócio criado!',
        description: 'O card foi adicionado ao pipeline.',
      });

      setIsCreateDialogOpen(false);
      setNewDeal({ title: '', value: '', stage_id: '' });
      fetchPipelineData();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar negócio',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setSelectedStageId(deal.stage_id);
    setIsEditDialogOpen(true);
  };

  const canMoveToStage = (dealId: string, targetStageId: string): boolean => {
    // Get required fields for target stage
    const requiredFields = customFields.filter(
      f => f.stage_id === targetStageId && f.is_required
    );

    if (requiredFields.length === 0) return true;

    // Check if all required fields have values
    const values = dealFieldValues[dealId] || [];
    const filledFieldIds = new Set(values.map(v => v.field_id));

    return requiredFields.every(f => filledFieldIds.has(f.id));
  };

  const handleMoveDeal = async (targetStageId: string) => {
    if (!selectedDeal) return;

    if (!canMoveToStage(selectedDeal.id, targetStageId)) {
      toast({
        title: 'Campos obrigatórios não preenchidos',
        description: 'Preencha todos os campos obrigatórios antes de avançar.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('deals')
        .update({ stage_id: targetStageId, updated_at: new Date().toISOString() })
        .eq('id', selectedDeal.id);

      if (error) throw error;

      toast({
        title: 'Negócio movido!',
        description: 'O card foi movido para a nova etapa.',
      });

      setSelectedStageId(targetStageId);
      fetchPipelineData();
    } catch (error: any) {
      toast({
        title: 'Erro ao mover negócio',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!pipeline || stages.length === 0) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Pipeline não configurado</h2>
          <p className="text-muted-foreground mb-4">
            {role === 'admin' 
              ? 'Configure as etapas do funil para começar.'
              : 'Aguarde um administrador configurar o pipeline.'}
          </p>
          {role === 'admin' && (
            <Button onClick={() => navigate('/admin')}>
              Configurar Pipeline
            </Button>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{pipeline.name}</h2>
          <p className="text-muted-foreground">{pipeline.description}</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Negócio
        </Button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter(d => d.stage_id === stage.id);
          return (
            <StageColumn
              key={stage.id}
              name={stage.name}
              color={stage.color}
              dealCount={stageDeals.length}
            >
              {stageDeals.map((deal) => (
                <DealCard
                  key={deal.id}
                  id={deal.id}
                  title={deal.title}
                  value={deal.value}
                  ownerName={deal.profiles?.full_name}
                  onClick={() => handleDealClick(deal)}
                />
              ))}
            </StageColumn>
          );
        })}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Negócio</DialogTitle>
            <DialogDescription>
              Adicione um novo card ao pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={newDeal.title}
                onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })}
                placeholder="Nome do negócio"
              />
            </div>
            <div>
              <Label htmlFor="value">Valor</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                value={newDeal.value}
                onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="stage">Etapa *</Label>
              <Select
                value={newDeal.stage_id}
                onValueChange={(value) => setNewDeal({ ...newDeal, stage_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateDeal} className="w-full">
              Criar Negócio
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDeal?.title}</DialogTitle>
            <DialogDescription>
              Visualize e mova o negócio entre etapas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor</Label>
              <p className="text-2xl font-bold text-success">
                {selectedDeal?.value 
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedDeal.value)
                  : 'Não definido'}
              </p>
            </div>
            <div>
              <Label htmlFor="move-stage">Mover para etapa</Label>
              <Select
                value={selectedStageId}
                onValueChange={handleMoveDeal}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedDeal && selectedStageId && (
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Campos da etapa:</h4>
                {customFields
                  .filter(f => f.stage_id === selectedStageId)
                  .map(field => {
                    const fieldValue = (dealFieldValues[selectedDeal.id] || []).find(
                      v => v.field_id === field.id
                    );
                    return (
                      <div key={field.id} className="mb-2">
                        <Label className="text-sm">
                          {field.name}
                          {field.is_required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {fieldValue?.value || '(não preenchido)'}
                        </p>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Index;
