import type { ServerResponse } from "node:http";
import type { ExamService } from "../services/exam-service.js";
import { sendSuccess } from "../serializers/response.js";
import { validateSummaryQuery } from "../validation.js";
import type { AuthenticatedRequest } from "../middlewares/auth.js";

export class ExamController {
  constructor(private examService: ExamService) {}

  getExamSummary(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
    const query = validateSummaryQuery(url);
    const summary = this.examService.getExamSummary({
      period: query.period,
      fromDate: query.fromDate,
      toDate: query.toDate,
      courseId: query.courseId,
      courseType: query.courseType,
      status: query.status,
    });

    sendSuccess(res, summary.data, {
      period: summary.period,
      fromDate: summary.fromDate,
      toDate: summary.toDate,
    });
  }

  getExamsByCourse(req: AuthenticatedRequest, res: ServerResponse, url: URL) {
    const query = validateSummaryQuery(url);
    const result = this.examService.getExamsByCourse(
      {
        period: query.period,
        fromDate: query.fromDate,
        toDate: query.toDate,
        courseId: query.courseId,
        courseType: query.courseType,
        status: query.status,
      },
      query.page,
      query.perPage,
    );

    sendSuccess(res, result.data, {
      pagination: result.pagination,
      period: query.period,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  }
}
