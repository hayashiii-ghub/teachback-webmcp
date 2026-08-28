import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { CaretLeft } from "@phosphor-icons/react/CaretLeft";
import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { Check } from "@phosphor-icons/react/Check";
import { Circle } from "@phosphor-icons/react/Circle";
import { X } from "@phosphor-icons/react/X";
import type { IconProps as PhosphorIconProps } from "@phosphor-icons/react";

interface IconProps {
  className?: string;
}

const sharedProps: Pick<PhosphorIconProps, "aria-hidden" | "focusable"> = {
  "aria-hidden": true,
  focusable: false,
};

export function ArrowRightIcon({ className }: IconProps) {
  return <ArrowRight {...sharedProps} className={className} weight="regular" />;
}

export function CaretRightIcon({ className }: IconProps) {
  return <CaretRight {...sharedProps} className={className} weight="bold" />;
}

export function CaretLeftIcon({ className }: IconProps) {
  return <CaretLeft {...sharedProps} className={className} weight="bold" />;
}

export function CheckIcon({ className }: IconProps) {
  return <Check {...sharedProps} className={className} weight="bold" />;
}

export function CircleIcon({ className }: IconProps) {
  return <Circle {...sharedProps} className={className} weight="regular" />;
}

export function CloseIcon({ className }: IconProps) {
  return <X {...sharedProps} className={className} weight="bold" />;
}
