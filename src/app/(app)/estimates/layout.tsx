// Request pages read the signed-in person and the database on every request.
export const instant = false;

export default function EstimatesLayout({ children }: LayoutProps<"/estimates">) {
  return children;
}
