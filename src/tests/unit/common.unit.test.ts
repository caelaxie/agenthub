import { describe, expect, it } from "bun:test";

import { AppError } from "../../common/errors/app-error";
import { HttpError } from "../../common/errors/http-error";
import { generateOpaqueToken } from "../../common/utils/crypto";
import { addMinutes } from "../../common/utils/time";

describe("common errors", () => {
  it("serializes app errors into the standard envelope", () => {
    const error = new AppError({
      status: 409,
      code: "duplicate_publication_conflict",
      message: "Duplicate publication.",
    });

    expect(error.toResponse()).toEqual({
      error: {
        code: "duplicate_publication_conflict",
        message: "Duplicate publication.",
        retryable: false,
        details: {},
      },
    });
  });

  it("creates not implemented http errors", () => {
    const error = HttpError.notImplemented(
      "publication_publish_not_implemented",
      "Publishing agents has not been implemented yet.",
    );

    expect(error.status).toBe(501);
    expect(error.code).toBe("publication_publish_not_implemented");
  });
});

describe("common utilities", () => {
  it("builds opaque tokens with the requested prefix", () => {
    const token = generateOpaqueToken("test");

    expect(token.startsWith("test_")).toBe(true);
  });

  it("adds minutes to a date", () => {
    const result = addMinutes(new Date("2026-01-01T00:00:00.000Z"), 5);

    expect(result).toBe("2026-01-01T00:05:00.000Z");
  });
});
