export interface ResourceDefinition {
  name: string;
  hasList: boolean;
  hasCreate: boolean;
  hasShow: boolean;
  hasEdit: boolean;
  hasDelete: boolean;
  listPath?: string;
  createPath?: string;
  showPath?: string;
  editPath?: string;
  editMethod?: 'put' | 'patch';
  deletePath?: string;
  listOperationId?: string;
  createOperationId?: string;
  showOperationId?: string;
  editOperationId?: string;
  deleteOperationId?: string;
  listResponseSchema?: any;
  showResponseSchema?: any;
  createRequestBodySchema?: any;
  editRequestBodySchema?: any;
  listQueryParams?: string[];
  createForm?: any[];
  editForm?: any[];
}
