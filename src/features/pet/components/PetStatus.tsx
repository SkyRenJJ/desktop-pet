type PetStatusProps = {
  text: string;
};

export function PetStatus({ text }: PetStatusProps) {
  if (!text) {
    return null;
  }

  return <div className="pet-status">{text}</div>;
}