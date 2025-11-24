import axios from "axios";
import env from "../config/env.js";

const RAPID_API_KEY = env.RAPIDAPI_KEY;
const RAPID_API_HOST = env.RAPIDAPI_IMAGE_HOST ?? "free-images-api.p.rapidapi.com";
const RAPID_API_PATH = env.RAPIDAPI_IMAGE_PATH ?? "/v2/cat/1";

export const fetchImageFromRapidApi = async () => {
  if (!RAPID_API_KEY) {
    return null;
  }

  try {
    const url = `https://${RAPID_API_HOST}${RAPID_API_PATH}`;
    const response = await axios.get(url, {
      method: 'GET',
      headers: {
       'x-rapidapi-key': RAPID_API_KEY,
       'x-rapidapi-host': RAPID_API_HOST
      },
      timeout: 10_000
    });
    console.log("RapidAPI image response:", JSON.stringify(response.data, null, 2));
    const payload = response.data;
    if (typeof payload?.image === "string") {
      return payload.image;
    }
    if (Array.isArray(payload?.results) && typeof payload.results[0]?.image === "string") {
      return payload.results[0].image;
    }
    if (Array.isArray(payload?.data) && typeof payload.data[0]?.image === "string") {
      return payload.data[0].image;
    }
    return null;
  } catch (error) {
    console.error("RapidAPI image fetch failed:", error instanceof Error ? error.message : error);
    return null;
  }
};
