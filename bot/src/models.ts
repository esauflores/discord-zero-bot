// OpenRouter is the only endpoint: the Decisions API is exclusive to it and the
// pinned models below are OpenRouter slugs, so there is nothing to configure.
const apiUrl = "https://openrouter.ai/api/v1";

export const jevEndpoint = "https://openrouter.ai/api/alpha/decisions";
export const imageEndpoint = `${apiUrl}/images/generations`;
export const chatEndpoint = apiUrl;

// The Decisions API is text/JSON only (no vision).
export const jevModel = "typesafe/jev-1.13";

// Both accept text and images, so image messages and `open_attachment` results
// can go straight to them without a separate vision model.
export const cheapModel = "qwen/qwen3.7-flash";
export const smartModel = "deepseek/deepseek-v4.1-flash";

export const imageModel = "krea/krea-2-medium-turbo";
