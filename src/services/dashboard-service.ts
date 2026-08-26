import type { ExamDatabase } from "../database.js";
import type { DashboardSummaryResponse } from "../types.js";
import { ExamService, type ExamQueryFilters } from "./exam-service.js";
import { RegistrationService } from "./registration-service.js";

export class DashboardService {
  private examService: ExamService;
  private registrationService: RegistrationService;

  constructor(private db: ExamDatabase) {
    this.examService = new ExamService(db);
    this.registrationService = new RegistrationService(db);
  }

  getDashboardSummary(filters: ExamQueryFilters = {}, refDate: Date = new Date()): DashboardSummaryResponse["data"] {
    const examSummary = this.examService.getExamSummary(filters, refDate);
    const registrationSummary = this.registrationService.getRegistrationsSummary({
      courseId: filters.courseId,
      courseType: filters.courseType,
      refDate,
    });
    const topCourses = this.examService.getExamsByCourse(filters, 1, 10, refDate);

    return {
      exams: examSummary.data,
      registrations: registrationSummary,
      top_courses: topCourses.data,
    };
  }
}
