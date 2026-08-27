import type { Metadata } from "next";
import Participation from "../components/participation";
export const metadata: Metadata = { title: "이벤트 참여" };
export default function ParticipatePage() {
  return <Participation />;
}
