import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Save, Trash2, Home } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Stage {
  id?: string;
  name: string;
  color: string;
  position: number;
  fields: CustomField[];
}

interface CustomField {
  id?: string;
  name: string;
  field_type: 'text' | 'number' | 'date' | 'select';
  is_required: boolean;
  position: number;
}

const STAGE_COLORS = [
  '#3B82F6', // blue
  '#06B6D4', // cyan
  '#14B8A6', // teal
  '#10B981', // green
  '#84CC16', // lime
];

const Admin = () => {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [pipeline, setPipeline] = useState<any>(null);
  const [pipelineName, setPipelineName] = useState('');
  const [pipelineDesc, setPipelineDesc] = useState('');
  const [stages, setStages] = useState<Stage[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!loading && (!user || role !== 'admin')) {
      navigate('/');
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (user && role === 'admin') {
      fetchPipeline();
    }
  }, [user, role]);

  const fetchPipeline = async () => {
    try {
      const { data: pipelineData, error: pipelineError } = await supabase
        .from('pipelines')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (pipelineError) throw pipelineError;

      if (pipelineData) {
        setPipeline(pipelineData);
        setPipelineName(pipelineData.name);
        setPipelineDesc(pipelineData.description || '');

        // Fetch stages
        const { data: stagesData, error: stagesError } = await supabase
          .from('stages')
          .select('*')
          .eq('pipeline_id', pipelineData.id)
          .order('position', { ascending: true });

        if (stagesError) throw stagesError;

        // Fetch fields for each stage
        const stagesWithFields = await Promise.all(
          (stagesData || []).map(async (stage) => {
            const { data: fieldsData, error: fieldsError } = await supabase
              .from('custom_fields')
              .select('*')
              .eq('stage_id', stage.id)
              .order('position', { ascending: true });

            if (fieldsError) throw fieldsError;

            return {
              ...stage,
              fields: fieldsData || [],
            };
          })
        );

        setStages(stagesWithFields);
      }
    } catch (error: any) {
      console.error('Error fetching pipeline:', error);
      toast({
        title: 'Erro ao carregar pipeline',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSavePipeline = async () => {
    if (!pipelineName.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Digite um nome para o pipeline.',
        variant: 'destructive',
      });
      return;
    }

    if (stages.length === 0) {
      toast({
        title: 'Adicione etapas',
        description: 'Crie pelo menos uma etapa no funil.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      let pipelineId = pipeline?.id;

      // Create or update pipeline
      if (pipeline) {
        const { error } = await supabase
          .from('pipelines')
          .update({
            name: pipelineName,
            description: pipelineDesc,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pipeline.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('pipelines')
          .insert({
            name: pipelineName,
            description: pipelineDesc,
            created_by: user!.id,
          })
          .select()
          .single();

        if (error) throw error;
        pipelineId = data.id;
      }

      // Delete existing stages and fields
      if (pipeline) {
        await supabase.from('stages').delete().eq('pipeline_id', pipeline.id);
      }

      // Insert new stages and fields
      for (const stage of stages) {
        const { data: stageData, error: stageError } = await supabase
          .from('stages')
          .insert({
            pipeline_id: pipelineId,
            name: stage.name,
            color: stage.color,
            position: stage.position,
          })
          .select()
          .single();

        if (stageError) throw stageError;

        // Insert fields
        if (stage.fields.length > 0) {
          const fieldsToInsert = stage.fields.map(field => ({
            stage_id: stageData.id,
            name: field.name,
            field_type: field.field_type,
            is_required: field.is_required,
            position: field.position,
          }));

          const { error: fieldsError } = await supabase
            .from('custom_fields')
            .insert(fieldsToInsert);

          if (fieldsError) throw fieldsError;
        }
      }

      toast({
        title: 'Pipeline salvo!',
        description: 'As configurações foram salvas com sucesso.',
      });

      fetchPipeline();
    } catch (error: any) {
      console.error('Error saving pipeline:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addStage = () => {
    setStages([
      ...stages,
      {
        name: `Etapa ${stages.length + 1}`,
        color: STAGE_COLORS[stages.length % STAGE_COLORS.length],
        position: stages.length,
        fields: [],
      },
    ]);
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, updates: Partial<Stage>) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], ...updates };
    setStages(newStages);
  };

  const addField = (stageIndex: number) => {
    const newStages = [...stages];
    newStages[stageIndex].fields.push({
      name: `Campo ${newStages[stageIndex].fields.length + 1}`,
      field_type: 'text',
      is_required: false,
      position: newStages[stageIndex].fields.length,
    });
    setStages(newStages);
  };

  const removeField = (stageIndex: number, fieldIndex: number) => {
    const newStages = [...stages];
    newStages[stageIndex].fields = newStages[stageIndex].fields.filter((_, i) => i !== fieldIndex);
    setStages(newStages);
  };

  const updateField = (stageIndex: number, fieldIndex: number, updates: Partial<CustomField>) => {
    const newStages = [...stages];
    newStages[stageIndex].fields[fieldIndex] = {
      ...newStages[stageIndex].fields[fieldIndex],
      ...updates,
    };
    setStages(newStages);
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

  if (!user || role !== 'admin') return null;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Configurar Pipeline</h2>
            <p className="text-muted-foreground">Defina as etapas e campos obrigatórios do funil</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/')}>
              <Home className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <Button onClick={handleSavePipeline} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Salvando...' : 'Salvar Tudo'}
            </Button>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Informações do Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pipeline-name">Nome do Pipeline *</Label>
              <Input
                id="pipeline-name"
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                placeholder="Ex: Vendas B2B"
              />
            </div>
            <div>
              <Label htmlFor="pipeline-desc">Descrição</Label>
              <Input
                id="pipeline-desc"
                value={pipelineDesc}
                onChange={(e) => setPipelineDesc(e.target.value)}
                placeholder="Descrição do pipeline"
              />
            </div>
          </CardContent>
        </Card>

        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold">Etapas do Funil</h3>
          <Button onClick={addStage} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Etapa
          </Button>
        </div>

        <div className="space-y-4">
          {stages.map((stage, stageIndex) => (
            <Card key={stageIndex}>
              <CardHeader className="border-b" style={{ borderTopColor: stage.color, borderTopWidth: '3px' }}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 grid grid-cols-2 gap-4">
                    <div>
                      <Label>Nome da Etapa</Label>
                      <Input
                        value={stage.name}
                        onChange={(e) => updateStage(stageIndex, { name: e.target.value })}
                        placeholder="Nome da etapa"
                      />
                    </div>
                    <div>
                      <Label>Cor</Label>
                      <Select
                        value={stage.color}
                        onValueChange={(value) => updateStage(stageIndex, { color: value })}
                      >
                        <SelectTrigger>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: stage.color }} />
                            <span>{stage.color}</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {STAGE_COLORS.map((color) => (
                            <SelectItem key={color} value={color}>
                              <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                                <span>{color}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeStage(stageIndex)}
                    className="ml-2"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">Campos Personalizados</h4>
                  <Button
                    onClick={() => addField(stageIndex)}
                    variant="outline"
                    size="sm"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar Campo
                  </Button>
                </div>

                {stage.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum campo adicionado</p>
                ) : (
                  <div className="space-y-2">
                    {stage.fields.map((field, fieldIndex) => (
                      <div key={fieldIndex} className="flex items-center gap-2 p-2 border rounded-md">
                        <Input
                          value={field.name}
                          onChange={(e) => updateField(stageIndex, fieldIndex, { name: e.target.value })}
                          placeholder="Nome do campo"
                          className="flex-1"
                        />
                        <Select
                          value={field.field_type}
                          onValueChange={(value: any) => updateField(stageIndex, fieldIndex, { field_type: value })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="date">Data</SelectItem>
                            <SelectItem value="select">Lista</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1">
                          <Checkbox
                            checked={field.is_required}
                            onCheckedChange={(checked) =>
                              updateField(stageIndex, fieldIndex, { is_required: checked as boolean })
                            }
                          />
                          <Label className="text-xs">Obrigatório</Label>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeField(stageIndex, fieldIndex)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Admin;
