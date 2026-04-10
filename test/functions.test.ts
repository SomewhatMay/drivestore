import { sum } from "../src";

describe("sum", () => {
  it("should return 0 if an empty array is provided", () => {
    expect(sum([])).toBe(0);
  });

  it("should return single number if a single-number array is provided", () => {
    expect(sum([42])).toBe(42);
  });

  it("should provide the true sum of two numbers when provided", () => {
    expect(sum([20, 10])).toBe(30);
  });
});
