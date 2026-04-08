export const TCP_MESSAGES = {
  // Requests
  REQUEST_CREATE: 'time_off.request.create',
  REQUEST_FIND_ALL: 'time_off.request.findAll',
  REQUEST_FIND_ONE: 'time_off.request.findOne',
  REQUEST_APPROVE: 'time_off.request.approve',
  REQUEST_REJECT: 'time_off.request.reject',
  REQUEST_CANCEL: 'time_off.request.cancel',
  REQUEST_PENDING: 'time_off.request.pending',

  // Balances
  BALANCE_FIND_BY_EMPLOYEE: 'time_off.balance.findByEmployee',
  BALANCE_SYNC_FROM_HCM: 'time_off.balance.syncFromHcm',
  BALANCE_BATCH_SYNC: 'time_off.balance.batchSync',
  BALANCE_UPDATE_MANUAL: 'time_off.balance.updateManual',

  // Employees
  EMPLOYEE_CREATE: 'time_off.employee.create',
  EMPLOYEE_FIND_ALL: 'time_off.employee.findAll',
  EMPLOYEE_FIND_ONE: 'time_off.employee.findOne',
  EMPLOYEE_FIND_BY_EMAIL: 'time_off.employee.findByEmail',

  // Sync logs
  SYNC_LOGS_FIND_ALL: 'time_off.sync.logs',
} as const;

export const WS_EVENTS = {
  REQUEST_CREATED: 'request.created',
  REQUEST_APPROVED: 'request.approved',
  REQUEST_REJECTED: 'request.rejected',
  REQUEST_CANCELLED: 'request.cancelled',
  BALANCE_UPDATED: 'balance.updated',
  HCM_SYNC_COMPLETED: 'hcm.sync.completed',
} as const;

export const TIMEOFF_SERVICE = 'TIME_OFF_SERVICE';
