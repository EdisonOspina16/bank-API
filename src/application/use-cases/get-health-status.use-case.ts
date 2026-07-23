import { getStatus } from '../../domain/services/health.service';

function getHealthStatus() {
  return getStatus();
}

export default getHealthStatus;