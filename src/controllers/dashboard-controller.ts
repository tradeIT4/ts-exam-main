import type { ServerResponse } from "node:http";
import type { DashboardService } from "../services/dashboard-service.js";
import { sendSuccess } from "../serializers/response.js";
import { validateSummaryQuery } from "../validation.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";

export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  getDashboardSummary(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
    const query = validateSummaryQuery(url);
    const summary = this.dashboardService.getDashboardSummary({
      period: query.period,
      fromDate: query.fromDate,
      toDate: query.toDate,
      courseId: query.courseId,
      courseType: query.courseType,
      status: query.status,
    });

    sendSuccess(res, summary);
  }
}
