export function sum(numbers: number[]) {
  return numbers.reduce((total, x) => total + x, 0);
}
