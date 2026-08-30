import ky from "ky"

/**
 * Browser → same-origin Next BFF (`/api/...`).
 * COMP lobby stays private; never point this at :10999.
 */
export const api = ky.create({
  prefixUrl: "/api",
  credentials: "include",
  throwHttpErrors: false,
  hooks: {
    beforeRequest: [
      (request) => {
        request.headers.set("X-Requested-With", "XMLHttpRequest")
        if (request.body instanceof FormData) {
          request.headers.delete("Content-Type")
        } else if (request.body && typeof request.body === "string") {
          request.headers.set("Content-Type", "application/json")
        }
      },
    ],
  },
})
