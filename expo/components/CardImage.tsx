import React, { useMemo } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { getCardImageSource } from '@/utils/imageHelper';

interface CardImageProps {
  cardId: number;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  size?: 'small' | 'medium' | 'large';
  style?: object;
}

function CardImageComponent({ cardId, imageUrl, thumbnailUrl, size = 'small', style }: CardImageProps) {
  const source = useMemo(
    () => getCardImageSource(imageUrl, thumbnailUrl, size === 'small'),
    [imageUrl, thumbnailUrl, size]
  );

  const dimensions = useMemo(() => {
    switch (size) {
      case 'small': return { width: 60, height: 84 };
      case 'medium': return { width: 120, height: 168 };
      case 'large': return { width: 280, height: 392 };
    }
  }, [size]);

  if (!source) {
    return (
      <View style={[styles.placeholder, dimensions, style]} testID="card-image-placeholder">
        <ImageOff size={dimensions.width * 0.3} color={Colors.textMuted} />
      </View>
    );
  }

  return (
    <Image
      source={source}
      style={[styles.image, dimensions, style]}
      resizeMode="cover"
      testID={`card-image-${cardId}`}
    />
  );
}

export default React.memo(CardImageComponent);

const styles = StyleSheet.create({
  image: {
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
  },
  placeholder: {
    borderRadius: 6,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
});
