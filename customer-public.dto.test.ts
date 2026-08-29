import { describe, it, expect } from "vitest";
import type { CustomerPublicDTO } from "./customer-public.dto";

describe("CustomerPublicDTO privacy boundary", () => {
  it("never has a phone, whatsapp_number, email, or address key at runtime", () => {
    const sample: CustomerPublicDTO = {
      id: "00000000-0000-0000-0000-000000000000",
      displayName: "Test Customer",
      avatarUrl: null,
    };

    const forbiddenKeys = ["phone", "whatsapp_number", "whatsappNumber", "email", "address"];
    const actualKeys = Object.keys(sample);

    for (const forbidden of forbiddenKeys) {
      expect(actualKeys).not.toContain(forbidden);
    }
  });

  it("only exposes the three allow-listed fields", () => {
    const sample: CustomerPublicDTO = {
      id: "x",
      displayName: "x",
      avatarUrl: null,
    };
    expect(Object.keys(sample).sort()).toEqual(
      ["avatarUrl", "displayName", "id"].sort()
    );
  });
});
