// Reference hours pages read the signed-in person and the database on every request.
export const instant = false;

export default function ReferencesLayout({ children }: LayoutProps<"/references">) {
  return children;
}
