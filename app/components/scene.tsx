import {
  Activity,
  DoorOpen,
  Droplets,
  Flashlight,
  HeartPulse,
  PackageOpen,
  Radio,
  Signpost,
  Smartphone,
  UserRound,
} from "lucide-react";
import type { Question } from "../lib/questions";

const icons = {
  stranger: UserRound,
  water: Droplets,
  symptom: Activity,
  food: PackageOpen,
  injury: HeartPulse,
  broadcast: Radio,
  paths: Signpost,
  flashlight: Flashlight,
  phone: Smartphone,
  exit: DoorOpen,
};

export function Scene({ question }: { question: Question }) {
  const Icon = icons[question.scene as keyof typeof icons];
  return (
    <div className="scene" data-scene={question.scene} aria-hidden="true">
      <span className="scene-code">
        SCENARIO / {String(question.id).padStart(2, "0")}
      </span>
      <div className="scene-halo" />
      <div className="scene-orbit" />
      <Icon className="scene-symbol" strokeWidth={1} />
      <div className="scene-floor" />
      <span className="scene-name">{question.title}</span>
      <span className="scene-coordinate">DECISION REQUIRED</span>
    </div>
  );
}
