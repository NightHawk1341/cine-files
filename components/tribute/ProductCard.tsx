import styles from '@/styles/components/tribute-product.module.css';

interface ProductCardProps {
  name: string;
  price: number;
  imageUrl: string;
  url: string;
}

export function ProductCard({ name, price, imageUrl, url }: ProductCardProps) {
  const formattedPrice = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={styles.card}>
      <div className={styles.imageWrapper}>
        <img src={imageUrl} alt={name} className={styles.image} loading="lazy" />
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{name}</p>
        <p className={styles.price}>{formattedPrice}</p>
      </div>
      <span className={styles.badge}>TR-BUTE</span>
    </a>
  );
}
