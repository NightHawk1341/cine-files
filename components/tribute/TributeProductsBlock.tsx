import { fetchTributeProducts } from '@/lib/tribute-api';
import { ProductCard } from './ProductCard';
import styles from '@/styles/components/tribute-block.module.css';

interface TributeProductsBlockProps {
  productIds: number[];
}

export async function TributeProductsBlock({ productIds }: TributeProductsBlockProps) {
  const products = await fetchTributeProducts(productIds);

  if (products.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>Товары на TR-BUTE</span>
      </div>
      <div className={styles.grid}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            name={product.name}
            price={product.price}
            imageUrl={product.imageUrl}
            url={product.url}
          />
        ))}
      </div>
    </div>
  );
}
