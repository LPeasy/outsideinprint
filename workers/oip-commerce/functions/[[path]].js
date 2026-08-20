import { handleRequest } from "../src/index.js";

export function onRequest(context) {
  return handleRequest(context.request, context.env, context);
}
