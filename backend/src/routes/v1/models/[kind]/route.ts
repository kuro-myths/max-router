import { buildModelsList } from "../route.js";

// URL slug → service kind(s). `web` covers both webSearch and webFetch.
const KIND_SLUG_MAP = {
  "image": ["image"],
  "video": ["video"],
  "video": ["video"],
  "tts": ["tts"],
  "stt": ["stt"],
  "embedding": ["embedding"],
  "image-to-text": ["imageToText"],
  "web": ["webSearch", "webFetch"],
};

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * GET /v1/models/{kind} - OpenAI-compatible models list filtered by capability.
 * Supported kinds: image, video, tts, stt, embedding, image-to-text, web.
 */
export async function GET(_request, { params }) {
  try {
    const { kind } = await params;
    const kindFilter = KIND_SLUG_MAP[kind];

    if (!kindFilter) {
      return Response.json(
        {
          error: {
            message: `Unknown model kind: ${kind}. Supported: ${Object.keys(KIND_SLUG_MAP).join(", ")}`,
            type: "invalid_request_error",
          },
        },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await buildModelsList(kindFilter);
    return Response.json({ object: "list", data }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (error) {
    console.log("Error fetching models by kind:", error);
    return Response.json(
      { error: { message: error.message, type: "server_error" } },
      { status: 500 }
    );
  }
}

/**
 * Express adapter for the backend auto-router. The original GET above follows
 * the Next.js App Router signature (request, { params }), while the Express
 * auto-router invokes GET_handler(req, res, { params }). Without this adapter,
 * /api/v1/models/:kind throws because Express Response is mistaken for context.
 */
export async function GET_handler(req, res) {
  try {
    const kind = req.params?.kind;
    const kindFilter = KIND_SLUG_MAP[kind];

    if (!kindFilter) {
      return res.status(404).json({
        error: {
          message: `Unknown model kind: ${kind}. Supported: ${Object.keys(KIND_SLUG_MAP).join(", ")}`,
          type: "invalid_request_error",
        },
      });
    }

    const data = await buildModelsList(kindFilter);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");
    return res.json({ object: "list", data });
  } catch (error) {
    console.log("Error fetching models by kind (Express adapter):", error);
    return res.status(500).json({
      error: { message: error.message, type: "server_error" },
    });
  }
}
