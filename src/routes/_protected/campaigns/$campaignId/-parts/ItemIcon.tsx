import {
	Crown,
	Flame,
	FlaskConical,
	Gem,
	Hammer,
	Package,
	Scroll,
	Shield,
	Sword,
	Wand2,
	Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

type ItemIconProps = {
	iconName: string;
	className?: string;
};

const ItemIcon = ({ iconName, className = 'w-7 h-7' }: ItemIconProps) => {
	const icons: Record<string, ReactNode> = {
		Sword: <Sword className={className} />,
		Shield: <Shield className={className} />,
		FlaskConical: <FlaskConical className={className} />,
		Scroll: <Scroll className={className} />,
		Gem: <Gem className={className} />,
		Flame: <Flame className={className} />,
		Zap: <Zap className={className} />,
		Hammer: <Hammer className={className} />,
		Crown: <Crown className={className} />,
		Wand2: <Wand2 className={className} />,
		Package: <Package className={className} />,
	};

	return icons[iconName] ?? <Gem className={className} />;
};

export default ItemIcon;
