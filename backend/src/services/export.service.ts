import { ApiError, badRequest } from "../utils/api-error.js";

export const generateProfileExport = async (_userId: string) => {
  throw new ApiError(503, "Profile export is disabled until Cloud Storage integration is available.");
};

export const validateExportRequest = (userId: string) => {
  if (!userId) {
    throw badRequest("UserId is required");
  }
};
