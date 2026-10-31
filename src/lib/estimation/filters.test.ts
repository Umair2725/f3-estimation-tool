import { describe, expect, it } from "vitest";
import { filtersToSearch, hasActiveFilters, parseFilters } from "./filters";

describe("parseFilters", () => {
  it("defaults to all requests, page 1", () => {
    const filters = parseFilters({});
    expect(filters).toEqual({
      view: "all",
      q: "",
      status: null,
      owner: null,
      client: null,
      tech: null,
      page: 1,
    });
    expect(hasActiveFilters(filters)).toBe(false);
  });

  it("reads known values and ignores unknown ones", () => {
    expect(
      parseFilters({ view: "mine", q: " portal ", status: "DRAFT", tech: "t1", page: "3" }),
    ).toMatchObject({ view: "mine", q: "portal", status: "DRAFT", tech: "t1", page: 3 });
    expect(parseFilters({ view: "everything", status: "LOST", page: "-2" })).toMatchObject({
      view: "all",
      status: null,
      page: 1,
    });
    expect(parseFilters({ q: ["a", "b"] }).q).toBe("a");
  });

  it("round-trips through the address, leaving out defaults", () => {
    const search = filtersToSearch({ view: "mine", q: "portal", status: "DRAFT", page: 1 });
    expect(search).toBe("?view=mine&q=portal&status=DRAFT");
    expect(parseFilters(Object.fromEntries(new URLSearchParams(search)))).toMatchObject({
      view: "mine",
      q: "portal",
      status: "DRAFT",
    });
    expect(filtersToSearch({ view: "all", page: 1 })).toBe("");
  });
});
