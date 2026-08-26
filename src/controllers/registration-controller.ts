import type { ServerResponse } from "node:http";
import type { RegistrationService } from "../services/registration-service.js";
import { sendSuccess } from "../serializers/response.js";
import { validateSummaryQuery } from "../validation.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";

export class RegistrationController {
  constructor(private registrationService: RegistrationService) {}

  getRegistrationsSummary(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
    const query = validateSummaryQuery(url);
    const summary = this.registrationService.getRegistrationsSummary({
      courseId: query.courseId,
      courseType: query.courseType,
    });

    sendSuccess(res, summary);
  }
}
