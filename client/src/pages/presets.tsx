import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Play, Calendar, Database, BookmarkCheck } from "lucide-react";
import type { Preset } from "@shared/schema";

export default function PresetsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: presets, isLoading } = useQuery<Preset[]>({
    queryKey: ["/api/presets"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/presets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/presets"] });
      toast({ title: "Preset eliminado" });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar el preset.", variant: "destructive" });
    },
  });

  const handleLoadPreset = (preset: Preset) => {
    try {
      const ids = JSON.parse(preset.datasetIds);
      if ((window as any).__applyPreset) {
        (window as any).__applyPreset(ids, preset.startDate, preset.endDate);
      }
      setLocation("/");
    } catch {
      toast({ title: "Error", description: "Preset con formato inválido.", variant: "destructive" });
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BookmarkCheck className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold">Presets Guardados</h1>
        </div>

        {isLoading && (
          <div className="grid gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        )}

        {!isLoading && (!presets || presets.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <BookmarkCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No hay presets guardados</p>
            <p className="text-xs mt-1">Guarda una consulta desde el explorador para verla aquí</p>
          </div>
        )}

        {!isLoading && presets && presets.length > 0 && (
          <div className="grid gap-3">
            {presets.map((preset) => {
              let datasetCount = 0;
              try {
                datasetCount = JSON.parse(preset.datasetIds).length;
              } catch {}
              return (
                <Card key={preset.id} className="group" data-testid={`preset-card-${preset.id}`}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`preset-name-${preset.id}`}>{preset.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {preset.startDate} — {preset.endDate}
                        </span>
                        <span className="flex items-center gap-1">
                          <Database className="w-3 h-3" />
                          {datasetCount} variable(s)
                        </span>
                      </div>
                      {preset.createdAt && (
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          Creado: {new Date(preset.createdAt).toLocaleDateString("es-CO")}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => handleLoadPreset(preset)}
                        data-testid={`btn-load-preset-${preset.id}`}
                      >
                        <Play className="w-3 h-3" /> Cargar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1 text-xs"
                        onClick={() => deleteMutation.mutate(preset.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`btn-delete-preset-${preset.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
