export interface HealthStatus {
  status: 'ok';
  service: string;
  timestamp: string;
}

export function getStatus(): HealthStatus {
  return {
    status: 'ok',
    service: 'bank-api',
    timestamp: new Date().toISOString()
  };
}