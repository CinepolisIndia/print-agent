export interface PrintJob {
    job_id: string;
    kot: string;
  }
  
  export interface AgentConfig {
    backendUrl: string;
    externalId: string;
    agentId: string;
    printerInterface: string;
    printerType: string;
    printerWidth: number;
    ackEndpoint: string;
    sseEndpoint: string;
  }

  export interface HealthCheckResult {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    checks: {
      printer: CheckDetail;
      venueConfig: CheckDetail;
    };
  }

  export interface CheckDetail {
    ok: boolean;
    message: string;
    latencyMs?: number;
  }
