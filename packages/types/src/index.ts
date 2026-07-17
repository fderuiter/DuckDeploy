/**
 * Defines a resource with its supported operations, paths, and schemas.
 */
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
  xPaginationTotal?: string;
  xHalEmbedded?: string;
  xRecordId?: string;
  xDataCollection?: string;
}

/**
 * Standard HTTP methods for typical CRUD operations.
 */
export const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
]);

/**
 * Extended set of HTTP methods including options and trace.
 */
export const FULL_HTTP_METHODS = new Set([
  ...HTTP_METHODS,
  'options',
  'head',
  'trace',
]);
