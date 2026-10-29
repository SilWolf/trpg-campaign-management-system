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
import { getItemImageUrl } from '@/lib/itemIcon';

type ItemIconProps = {
	iconName: string;
	className?: string;
	imageSize?: '128' | '512';
};

const ItemIcon = ({
	iconName,
	className = 'w-7 h-7',
	imageSize = '128',
}: ItemIconProps) => {
	const imageUrl = getItemImageUrl(iconName, imageSize);
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
	const fallbackIcon = icons[iconName] ?? <Gem className={className} />;

	return (
		<>
			{fallbackIcon}
			{imageUrl && (
				<img
					src={imageUrl}
					alt=''
					className='absolute inset-0 h-full w-full rounded-[inherit] object-cover'
					loading='lazy'
					decoding='async'
					referrerPolicy='no-referrer'
					draggable={false}
					onError={(event) => {
						event.currentTarget.hidden = true;
					}}
				/>
			)}
		</>
	);
};

export default ItemIcon;
