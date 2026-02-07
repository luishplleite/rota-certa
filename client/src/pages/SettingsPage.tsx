import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Settings, Save, ArrowLeft, MapPin, Download, Trash2, X, Check, Loader2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatCurrency } from '@/lib/utils';
import { useOfflineMap } from '@/hooks/useOfflineMap';
import type { AccountSettings } from '@shared/schema';

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [earningPerDelivery, setEarningPerDelivery] = useState('2.80');
  const [sundayBonusThreshold, setSundayBonusThreshold] = useState('50');
  const [sundayBonusValue, setSundayBonusValue] = useState('100.00');
  const [selectedCity, setSelectedCity] = useState<string>('');

  const {
    cities,
    offlineCities,
    downloadProgress,
    isLoading: isLoadingMap,
    downloadCityTiles,
    cancelDownload,
    removeCityTiles,
    estimateDownloadSize,
    isCityDownloaded,
    resetProgress
  } = useOfflineMap();

  const { data: settings, isLoading } = useQuery<AccountSettings>({
    queryKey: ['/api/settings'],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (settings) {
      setEarningPerDelivery(settings.earningPerDelivery.toFixed(2));
      setSundayBonusThreshold(settings.sundayBonusThreshold.toString());
      setSundayBonusValue(settings.sundayBonusValue.toFixed(2));
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: AccountSettings) => {
      const response = await apiRequest('PATCH', '/api/settings', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      toast({
        title: 'Configuracoes salvas',
        description: 'Seus valores foram atualizados com sucesso.',
      });
    },
    onError: () => {
      toast({
        title: 'Erro',
        description: 'Nao foi possivel salvar as configuracoes.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    const data = {
      earningPerDelivery: parseFloat(earningPerDelivery) || 2.80,
      sundayBonusThreshold: parseInt(sundayBonusThreshold) || 50,
      sundayBonusValue: parseFloat(sundayBonusValue) || 100.00,
    };
    updateMutation.mutate(data);
  };

  const hasChanges = settings && (
    parseFloat(earningPerDelivery) !== settings.earningPerDelivery ||
    parseInt(sundayBonusThreshold) !== settings.sundayBonusThreshold ||
    parseFloat(sundayBonusValue) !== settings.sundayBonusValue
  );

  const handleDownloadCity = () => {
    if (!selectedCity) return;
    downloadCityTiles(selectedCity);
  };

  const handleRemoveCity = (cityId: string) => {
    removeCityTiles(cityId);
    toast({
      title: 'Mapa removido',
      description: 'Os tiles desta cidade foram removidos do cache.',
    });
  };

  const selectedCityEstimate = selectedCity ? estimateDownloadSize(selectedCity) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-20 space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation('/plan')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Configuracoes</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Valores de Entrega</CardTitle>
          <CardDescription>
            Configure os valores que serao usados para calcular seus ganhos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="earningPerDelivery">Valor por entrega (R$)</Label>
            <Input
              id="earningPerDelivery"
              type="number"
              step="0.01"
              min="0.01"
              value={earningPerDelivery}
              onChange={(e) => setEarningPerDelivery(e.target.value)}
              placeholder="2.80"
            />
            <p className="text-xs text-muted-foreground">
              Valor recebido por cada entrega realizada
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bonus de Domingo</CardTitle>
          <CardDescription>
            Configure a meta e valor do bonus para entregas aos domingos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sundayBonusThreshold">Meta de entregas</Label>
            <Input
              id="sundayBonusThreshold"
              type="number"
              min="1"
              value={sundayBonusThreshold}
              onChange={(e) => setSundayBonusThreshold(e.target.value)}
              placeholder="50"
            />
            <p className="text-xs text-muted-foreground">
              Numero de entregas necessarias para ganhar o bonus
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sundayBonusValue">Valor do bonus (R$)</Label>
            <Input
              id="sundayBonusValue"
              type="number"
              step="0.01"
              min="0"
              value={sundayBonusValue}
              onChange={(e) => setSundayBonusValue(e.target.value)}
              placeholder="100.00"
            />
            <p className="text-xs text-muted-foreground">
              Valor do bonus ao atingir a meta de entregas no domingo
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="bg-muted/50 rounded-lg p-3">
        <p className="text-sm text-muted-foreground">
          <strong>Resumo:</strong> A cada entrega voce recebe{' '}
          <span className="text-foreground font-medium">
            {formatCurrency(parseFloat(earningPerDelivery) || 2.80)}
          </span>
          . Aos domingos, ao completar{' '}
          <span className="text-foreground font-medium">
            {parseInt(sundayBonusThreshold) || 50} entregas
          </span>
          , voce ganha um bonus de{' '}
          <span className="text-foreground font-medium">
            {formatCurrency(parseFloat(sundayBonusValue) || 100.00)}
          </span>
          .
        </p>
      </div>

      <Button
        className="w-full gap-2"
        onClick={handleSave}
        disabled={updateMutation.isPending || !hasChanges}
      >
        <Save className="h-4 w-4" />
        {updateMutation.isPending ? 'Salvando...' : 'Salvar Configuracoes'}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Mapa Offline
          </CardTitle>
          <CardDescription>
            Baixe o mapa de uma cidade para usar quando estiver sem internet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {offlineCities.length > 0 && (
            <div className="space-y-2">
              <Label>Cidades baixadas</Label>
              <div className="space-y-2">
                {offlineCities.map((city) => (
                  <div 
                    key={city.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-sm font-medium">{city.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {city.tilesCount.toLocaleString()} tiles - {new Date(city.downloadedAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveCity(city.id)}
                      data-testid={`button-remove-city-${city.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="selectCity">Baixar nova cidade</Label>
            <Select 
              value={selectedCity} 
              onValueChange={setSelectedCity}
              disabled={downloadProgress.status === 'downloading'}
            >
              <SelectTrigger id="selectCity" data-testid="select-city">
                <SelectValue placeholder="Selecione uma cidade" />
              </SelectTrigger>
              <SelectContent>
                {cities.map((city) => (
                  <SelectItem 
                    key={city.id} 
                    value={city.id}
                    disabled={isCityDownloaded(city.id)}
                  >
                    {city.name} - {city.state}
                    {isCityDownloaded(city.id) && ' (Baixado)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCityEstimate && !isCityDownloaded(selectedCity) && (
              <p className="text-xs text-muted-foreground">
                Aproximadamente {selectedCityEstimate.tiles.toLocaleString()} tiles (~{selectedCityEstimate.sizeEstimate})
              </p>
            )}
          </div>

          {downloadProgress.status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Baixando... {downloadProgress.percentage}%</span>
                <span>{downloadProgress.current.toLocaleString()} / {downloadProgress.total.toLocaleString()}</span>
              </div>
              <Progress value={downloadProgress.percentage} />
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={cancelDownload}
                data-testid="button-cancel-download"
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            </div>
          )}

          {downloadProgress.status === 'completed' && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-600 rounded-lg">
              <Check className="h-4 w-4" />
              <span className="text-sm">Download concluido!</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto"
                onClick={resetProgress}
              >
                Ok
              </Button>
            </div>
          )}

          {downloadProgress.status === 'error' && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <X className="h-4 w-4" />
              <span className="text-sm">{downloadProgress.error || 'Erro no download'}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto"
                onClick={resetProgress}
              >
                Ok
              </Button>
            </div>
          )}

          {downloadProgress.status === 'cancelled' && (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 text-yellow-600 rounded-lg">
              <X className="h-4 w-4" />
              <span className="text-sm">Download cancelado</span>
              <Button 
                variant="ghost" 
                size="sm" 
                className="ml-auto"
                onClick={resetProgress}
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {downloadProgress.status === 'idle' && selectedCity && !isCityDownloaded(selectedCity) && (
            <Button
              className="w-full gap-2"
              onClick={handleDownloadCity}
              disabled={!selectedCity || isLoadingMap}
              data-testid="button-download-city"
            >
              <Download className="h-4 w-4" />
              Baixar Mapa Offline
            </Button>
          )}

          <p className="text-xs text-muted-foreground">
            O mapa sera baixado nos niveis de zoom 13-17, ideal para navegacao em entregas.
            Quando estiver sem internet, o mapa usara os tiles salvos automaticamente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
