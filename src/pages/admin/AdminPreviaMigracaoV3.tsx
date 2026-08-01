import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

type Cliente = { id: number; nome: string; mercadinho_id: number | null };
type Mercadinho = { id: number; nome: string };

type MesV2 = {
  mes: string;
  total_caderneta: number;
  saldo_mes: number;
};

type Linha = {
  cliente_id: number;
  cliente_nome: string;
  mercadinho_id: number | null;
  mes: string;
  compras: number;
  divida_v2: number;
  pagamento_sugerido: number;
  status: "quitado" | "parcial" | "em_aberto";
  divergencia: boolean;
  motivo_divergencia?: string;
};

const MESES_PT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function formatBRL(v: number) {
  return (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMes(mes: string) {
  const [ano, m] = mes.split("-");
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return mes;
  return `${MESES_PT[idx]}/${ano}`;
}

function statusBadge(s: Linha["status"]) {
  switch (s) {
    case "quitado":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300";
    case "parcial":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";
    default:
      return "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300";
  }
}

function statusLabel(s: Linha["status"]) {
  if (s === "quitado") return "Quitado";
  if (s === "parcial") return "Parcial";
  return "Em aberto";
}

const AdminPreviaMigracaoV3 = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mercadinhos, setMercadinhos] = useState<Mercadinho[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number }>({ atual: 0, total: 0 });

  const [filtroMercadinho, setFiltroMercadinho] = useState<string>("todos");
  const [filtroCliente, setFiltroCliente] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: m }] = await Promise.all([
        supabase.from("clientes").select("id, nome, mercadinho_id").order("nome"),
        supabase.from("mercadinhos").select("id, nome").order("id"),
      ]);
      setClientes((c as any) || []);
      setMercadinhos((m as any) || []);
    })();
  }, []);

  const carregarPrevia = async () => {
    setLoading(true);
    setLinhas([]);
    try {
      const alvos = clientes.filter((c) =>
        filtroMercadinho === "todos" ? true : c.mercadinho_id === Number(filtroMercadinho)
      );
      setProgresso({ atual: 0, total: alvos.length });
      const resultado: Linha[] = [];

      // pequeno paralelismo para não sobrecarregar
      const chunkSize = 5;
      for (let i = 0; i < alvos.length; i += chunkSize) {
        const chunk = alvos.slice(i, i + chunkSize);
        const respostas = await Promise.all(
          chunk.map((cli) =>
            (supabase.rpc as any)("cliente_caderneta_v2", { p_cliente_id: cli.id })
              .then((r: any) => ({ cli, data: r.data, error: r.error }))
          )
        );
        for (const { cli, data, error } of respostas) {
          if (error || !data) continue;
          const meses: MesV2[] = (data.meses || []) as any;
          for (const mes of meses) {
            const compras = Number(mes.total_caderneta || 0);
            const divida = Number(mes.saldo_mes || 0);
            let divergencia = false;
            let motivo: string | undefined;

            if (compras < 0) {
              divergencia = true;
              motivo = "Compras negativas";
            } else if (divida < 0) {
              divergencia = true;
              motivo = "Dívida V2 negativa";
            } else if (divida > compras) {
              divergencia = true;
              motivo = "Dívida V2 maior que compras do mês";
            }

            const pagamento = divergencia ? 0 : Math.max(0, compras - divida);

            let status: Linha["status"];
            if (divida === 0) status = "quitado";
            else if (pagamento > 0 && divida > 0) status = "parcial";
            else status = "em_aberto";

            // ignorar meses totalmente vazios (sem compra e sem dívida)
            if (compras === 0 && divida === 0) continue;

            resultado.push({
              cliente_id: cli.id,
              cliente_nome: cli.nome,
              mercadinho_id: cli.mercadinho_id,
              mes: mes.mes,
              compras,
              divida_v2: divida,
              pagamento_sugerido: pagamento,
              status,
              divergencia,
              motivo_divergencia: motivo,
            });
          }
        }
        setProgresso({ atual: Math.min(i + chunkSize, alvos.length), total: alvos.length });
      }

      // ordena: cliente asc, mes asc
      resultado.sort((a, b) =>
        a.cliente_nome.localeCompare(b.cliente_nome) || a.mes.localeCompare(b.mes)
      );
      setLinhas(resultado);
      toast.success(`Prévia carregada: ${resultado.length} linhas`);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao carregar prévia");
    } finally {
      setLoading(false);
    }
  };

  const linhasFiltradas = useMemo(() => {
    const termo = filtroCliente.trim().toLowerCase();
    return linhas.filter((l) => {
      if (termo && !l.cliente_nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [linhas, filtroCliente]);

  const resumo = useMemo(() => {
    const clientesSet = new Set<number>();
    const mesesSet = new Set<string>();
    let totalSugerido = 0;
    let divergencias = 0;
    for (const l of linhasFiltradas) {
      clientesSet.add(l.cliente_id);
      mesesSet.add(`${l.cliente_id}-${l.mes}`);
      totalSugerido += l.pagamento_sugerido;
      if (l.divergencia) divergencias += 1;
    }
    return {
      clientes: clientesSet.size,
      meses: mesesSet.size,
      totalSugerido,
      divergencias,
    };
  }, [linhasFiltradas]);

  const nomeMercadinho = (id: number | null) =>
    mercadinhos.find((m) => m.id === id)?.nome || "—";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <BackButton to="/admin" />
          <h1 className="text-3xl font-bold">Prévia Migração V2 → V3</h1>
        </div>

        <Card className="border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-800 dark:text-amber-200">
                Tela apenas de auditoria
              </div>
              <div className="text-amber-700 dark:text-amber-300">
                Nenhum dado é gravado. Nenhuma tabela é alterada. Nenhuma RPC é executada
                além de <code>cliente_caderneta_v2</code> (somente leitura).
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filtros */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Mercadinho</label>
                <Select value={filtroMercadinho} onValueChange={setFiltroMercadinho}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {mercadinhos.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Buscar cliente</label>
                <Input
                  value={filtroCliente}
                  onChange={(e) => setFiltroCliente(e.target.value)}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="flex items-end">
                <Button onClick={carregarPrevia} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {loading
                    ? `Carregando (${progresso.atual}/${progresso.total})`
                    : "Carregar prévia"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Clientes analisados</div>
              <div className="text-2xl font-bold mt-1">{resumo.clientes}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Meses analisados</div>
              <div className="text-2xl font-bold mt-1">{resumo.meses}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total sugerido</div>
              <div className="text-2xl font-bold mt-1 text-emerald-600">
                {formatBRL(resumo.totalSugerido)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Divergências</div>
              <div className={`text-2xl font-bold mt-1 ${resumo.divergencias > 0 ? "text-rose-600" : ""}`}>
                {resumo.divergencias}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabela */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Mercadinho</th>
                  <th className="p-3">Mês</th>
                  <th className="p-3 text-right">Compras</th>
                  <th className="p-3 text-right">Dívida V2</th>
                  <th className="p-3 text-right">Pag. sugerido</th>
                  <th className="p-3">Status esperado V3</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      {loading ? "Carregando…" : "Nenhuma linha. Clique em \"Carregar prévia\"."}
                    </td>
                  </tr>
                ) : (
                  linhasFiltradas.map((l, idx) => (
                    <tr
                      key={`${l.cliente_id}-${l.mes}-${idx}`}
                      className={`border-t ${
                        l.divergencia
                          ? "bg-rose-50 dark:bg-rose-950/30"
                          : ""
                      }`}
                    >
                      <td className="p-3 font-medium">{l.cliente_nome}</td>
                      <td className="p-3 text-muted-foreground">{nomeMercadinho(l.mercadinho_id)}</td>
                      <td className="p-3">{formatMes(l.mes)}</td>
                      <td className="p-3 text-right">{formatBRL(l.compras)}</td>
                      <td className="p-3 text-right">{formatBRL(l.divida_v2)}</td>
                      <td className="p-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatBRL(l.pagamento_sugerido)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusBadge(l.status)}`}>
                            {statusLabel(l.status)}
                          </span>
                          {l.divergencia && (
                            <span className="text-xs text-rose-600 font-medium" title={l.motivo_divergencia}>
                              ⚠ {l.motivo_divergencia}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminPreviaMigracaoV3;
