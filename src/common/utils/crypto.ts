export const generateOpaqueToken = (prefix = "ahv1"): string =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
