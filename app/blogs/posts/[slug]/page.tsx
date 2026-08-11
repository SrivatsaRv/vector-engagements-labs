import { redirect } from "next/navigation";

export default function BlogsPostAliasPage({
  params,
}: {
  params: { slug: string };
}) {
  redirect(`/blog/${params.slug}`);
}
