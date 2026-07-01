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
}

export const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
]);

export const FULL_HTTP_METHODS = new Set([
  ...HTTP_METHODS,
  'options',
  'head',
  'trace',
]);
