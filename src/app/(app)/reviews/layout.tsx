// Review lists read the signed-in person and the database on every request.
export const instant = false;

export default function ReviewsLayout({ children }: LayoutProps<"/reviews">) {
  return children;
}
