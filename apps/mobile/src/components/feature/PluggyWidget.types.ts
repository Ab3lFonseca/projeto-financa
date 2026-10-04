export type PluggyWidgetProps = {
  visible: boolean;
  /** Token de curta duração (30 min) gerado pela nossa API. */
  connectToken: string;
  /** Só estes bancos (Open Finance regulado) aparecem no widget: ninguém digita senha de banco. */
  connectorIds: number[];
  /** Reconexão: abre o widget em modo de atualização desta conexão. */
  updateItem?: string | null;
  onSuccess: (itemId: string) => void;
  onClose: () => void;
  onError: (message: string) => void;
};
