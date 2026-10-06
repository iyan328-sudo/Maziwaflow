import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Maziwaflow Mobile — Dairy Collection System" },
      {
        name: "description",
        content: "Record and track daily milk collections from dairy farmers.",
      },
      { property: "og:title", content: "Maziwaflow Mobile — Dairy Collection System" },
      {
        property: "og:description",
        content: "Record and track daily milk collections from dairy farmers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
