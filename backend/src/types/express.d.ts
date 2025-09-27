import type { DecodedIdToken } from "firebase-admin/auth";
import type { UserDocument } from "../domain/types";

declare global {
  namespace Express {
    interface Request {
      authToken?: DecodedIdToken;
      authUser?: UserDocument | null;
    }
  }
}

export {};
