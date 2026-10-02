// OpenRouter is the only endpoint: the Decisions API is exclusive to it and the
// pinned models below are OpenRouter slugs, so there is nothing to configure.
const apiUrl = "https://openrouter.ai/api/v1";

export const jevEndpoint = "https://openrouter.ai/api/alpha/decisions";
export const imageEndpoint = `${apiUrl}/images/generations`;
export const chatEndpoint = apiUrl;
export const transcriptionEndpoint = `${apiUrl}/audio/transcriptions`;

// The Decisions API is text/JSON only (no vision).
export const jevModel = "typesafe/jev-1.13";

// Both accept text and images, so image messages and `open_attachment` results
// can go straight to them without a separate vision model.
export const cheapModel = "deepseek/deepseek-v4.1-flash";
export const smartModel = "deepseek/deepseek-v4.1-flash";

export const imageModel = "meta/muse-image";

// Voice notes are Spanish (often code-switched). Large-v3-turbo is the cheapest
// model that transcribed our test audio accurately; the non-distilled large-v3 is
// slightly better on very quiet clips for 3x the cost ($0.00003/call either way).
export const transcriptionModel = "openai/whisper-large-v3-turbo";
