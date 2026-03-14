'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useRef } from 'react';
import styles from '@/styles/components/footer.module.css';

function FooterSocialGroup({
  label,
  logoIcon,
  children,
  collapsed,
  onToggle,
}: {
  label: string;
  logoIcon: React.ReactNode;
  children: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`${styles.rightGroup}${collapsed ? ` ${styles.rightGroupCollapsed}` : ''}`}>
      <button
        className={styles.socialsButton}
        onClick={onToggle}
        title={label}
      >
        {logoIcon}
      </button>
      {!collapsed && (
        <ul className={styles.socialsList}>
          {children}
        </ul>
      )}
    </div>
  );
}

export function Footer() {
  const [isMobile, setIsMobile] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const updateMobile = useCallback(() => {
    setIsMobile(window.innerWidth <= 1024);
  }, []);

  useEffect(() => {
    updateMobile();
    let timeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(updateMobile, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeout);
    };
  }, [updateMobile]);

  // Click outside to close
  useEffect(() => {
    if (!isMobile) return;
    const handler = (e: MouseEvent) => {
      if (rightRef.current && !rightRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [isMobile]);

  const handleToggle = (group: string) => {
    if (!isMobile) return;
    setOpenGroup((prev: string | null) => prev === group ? null : group);
  };

  const tributeCollapsed = isMobile && openGroup !== 'tribute';
  const cinefilesCollapsed = isMobile && openGroup !== 'cinefiles';

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {/* Left group: nav links */}
        <div className={styles.left}>
          <nav className={styles.leftGroup}>
            <Link href="/about" className={styles.leftLink}>О проекте</Link>
            <Link href="/legal" className={styles.leftLink}>Правовая информация</Link>
            <Link href="/tags" className={styles.leftLink}>Все теги</Link>
            <Link href="/collections" className={styles.leftLink}>Подборки</Link>
          </nav>
        </div>

        {/* Right group: social pill groups */}
        <div className={styles.right} ref={rightRef}>
          {/* TR-BUTE socials */}
          <FooterSocialGroup
            label="TR/BUTE"
            collapsed={tributeCollapsed}
            onToggle={() => handleToggle('tribute')}
            logoIcon={
              <svg className={styles.logoIcon} width="20" height="20" viewBox="0 0 613.87 649.95" fill="currentColor">
                <path d="M582.52,264.15l-145.26,359.35-321.82.06c-6.08.83-16.45,14.81-22.37,18.03l-7.89,8.36h365.35l163.34-404.9-31.36,19.1Z"/>
                <polygon points="595.43 56.21 390.81 563 37.76 563 119.17 486.76 345.15 486.15 470.53 173.5 595.43 56.21"/>
                <polygon points="554.16 0 479.77 70.09 252.17 70.38 125.94 385.5 0 504.15 204.18 0 554.16 0"/>
                <polygon points="67.62 606.91 420.23 606.91 600.26 160.72 567.41 184.96 407.4 580.46 94.45 580.54 67.62 606.91"/>
                <polygon points="467.5 173.14 352.72 173.14 128.21 384.7 245.46 384.7 467.5 173.14"/>
              </svg>
            }
          >
            <li>
              <a href="https://t.me/buy_tribute" target="_blank" rel="noopener noreferrer" className={styles.socialLink} title="Telegram (TR/BUTE)">
                <svg viewBox="0 0 48 48" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M48 24C48 37.2548 37.2548 48 24 48C10.7452 48 0 37.2548 0 24C0 10.7452 10.7452 0 24 0C37.2548 0 48 10.7452 48 24ZM24.8601 17.7179C22.5257 18.6888 17.8603 20.6984 10.8638 23.7466C9.72766 24.1984 9.13251 24.6404 9.07834 25.0726C8.98677 25.803 9.90142 26.0906 11.1469 26.4822C11.3164 26.5355 11.4919 26.5907 11.6719 26.6492C12.8973 27.0475 14.5457 27.5135 15.4026 27.5321C16.1799 27.5489 17.0475 27.2284 18.0053 26.5707C24.5423 22.158 27.9168 19.9276 28.1286 19.8795C28.2781 19.8456 28.4852 19.803 28.6255 19.9277C28.7659 20.0524 28.7521 20.2886 28.7372 20.352C28.6466 20.7383 25.0562 24.0762 23.1982 25.8036C22.619 26.3421 22.2081 26.724 22.1242 26.8113C21.936 27.0067 21.7443 27.1915 21.56 27.3692C20.4215 28.4667 19.5678 29.2896 21.6072 30.6336C22.5873 31.2794 23.3715 31.8135 24.1539 32.3463C25.0084 32.9282 25.8606 33.5085 26.9632 34.2313C27.2442 34.4155 27.5125 34.6068 27.7738 34.7931C28.7681 35.5019 29.6615 36.1388 30.7652 36.0373C31.4065 35.9782 32.0689 35.3752 32.4053 33.5767C33.2004 29.3263 34.7633 20.1169 35.1244 16.3219C35.1561 15.9895 35.1163 15.5639 35.0843 15.3771C35.0523 15.1904 34.9855 14.9242 34.7427 14.7272C34.4552 14.4939 34.0113 14.4447 33.8127 14.4482C32.91 14.4641 31.5251 14.9456 24.8601 17.7179Z"/>
                </svg>
              </a>
            </li>
            <li>
              <a href="https://vk.com/buy_tribute" target="_blank" rel="noopener noreferrer" className={styles.socialLink} title="VK">
                <svg viewBox="0 0 48 48" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M3.37413 3.37413C0 6.74826 0 12.1788 0 23.04V24.96C0 35.8212 0 41.2517 3.37413 44.6259C6.74826 48 12.1788 48 23.04 48H24.96C35.8212 48 41.2517 48 44.6259 44.6259C48 41.2517 48 35.8212 48 24.96V23.04C48 12.1788 48 6.74826 44.6259 3.37413C41.2517 0 35.8212 0 24.96 0H23.04C12.1788 0 6.74826 0 3.37413 3.37413ZM8.10012 14.6001C8.36012 27.0801 14.6001 34.5801 25.5401 34.5801H26.1602V27.4401C30.1802 27.8401 33.22 30.7801 34.44 34.5801H40.1201C38.5601 28.9001 34.4599 25.7601 31.8999 24.5601C34.4599 23.0801 38.0599 19.4801 38.9199 14.6001H33.7598C32.6398 18.5601 29.3202 22.1601 26.1602 22.5001V14.6001H21V28.4401C17.8 27.6401 13.7601 23.7601 13.5801 14.6001H8.10012Z"/>
                </svg>
              </a>
            </li>
            <li>
              <a href="https://x.com/buy_tribute" target="_blank" rel="noopener noreferrer" className={styles.socialLink} title="X (Twitter)">
                <svg viewBox="0 0 48 48" fill="currentColor">
                  <path d="M36.6526 3.8078H43.3995L28.6594 20.6548L46 43.5797H32.4225L21.7881 29.6759L9.61989 43.5797H2.86886L18.6349 25.56L2 3.8078H15.9222L25.5348 16.5165L36.6526 3.8078ZM34.2846 39.5414H38.0232L13.8908 7.63406H9.87892L34.2846 39.5414Z"/>
                </svg>
              </a>
            </li>
            <li>
              <a href="https://ru.pinterest.com/buy_tribute/" target="_blank" rel="noopener noreferrer" className={styles.socialLink} title="Pinterest">
                <svg viewBox="0 0 48 48" fill="currentColor">
                  <path d="M24 0C10.7438 0 0 10.7438 0 24C0 34.1719 6.32812 42.8531 15.2531 46.35C15.0469 44.4469 14.85 41.5406 15.3375 39.4688C15.7781 37.5938 18.15 27.5437 18.15 27.5437C18.15 27.5437 17.4281 26.1094 17.4281 23.9813C17.4281 20.6438 19.3594 18.15 21.7687 18.15C23.8125 18.15 24.8063 19.6875 24.8063 21.5344C24.8063 23.5969 23.4937 26.6719 22.8187 29.5219C22.2562 31.9125 24.0187 33.8625 26.3719 33.8625C30.6375 33.8625 33.9187 29.3625 33.9187 22.875C33.9187 17.1281 29.7937 13.1063 23.8969 13.1063C17.0719 13.1063 13.0594 18.225 13.0594 23.5219C13.0594 25.5844 13.8562 27.7969 14.85 28.9969C15.0469 29.2312 15.075 29.4469 15.0187 29.6813C14.8406 30.4406 14.4281 32.0719 14.3531 32.4C14.25 32.8406 14.0063 32.9344 13.5469 32.7188C10.5469 31.3219 8.67188 26.9438 8.67188 23.4188C8.67188 15.8438 14.175 8.89688 24.525 8.89688C32.85 8.89688 39.3187 14.8313 39.3187 22.7625C39.3187 31.0312 34.1063 37.6875 26.8688 37.6875C24.4406 37.6875 22.1531 36.4219 21.3656 34.9313C21.3656 34.9313 20.1656 39.5156 19.875 40.6406C19.3312 42.7219 17.8687 45.3375 16.8937 46.9313C19.1437 47.625 21.525 48 24 48C37.2562 48 48 37.2562 48 24C48 10.7438 37.2562 0 24 0Z"/>
                </svg>
              </a>
            </li>
            <li>
              <a href="https://www.tiktok.com/@buy_tribute" target="_blank" rel="noopener noreferrer" className={styles.socialLink} title="TikTok">
                <svg viewBox="0 0 48 48" fill="currentColor">
                  <path d="M34.1451 0H26.0556V32.6956C26.0556 36.5913 22.9444 39.7913 19.0725 39.7913C15.2007 39.7913 12.0894 36.5913 12.0894 32.6956C12.0894 28.8696 15.1315 25.7391 18.8651 25.6V17.3913C10.6374 17.5304 4 24.2783 4 32.6956C4 41.1827 10.7757 48 19.1417 48C27.5075 48 34.2833 41.1131 34.2833 32.6956V15.9304C37.3255 18.1565 41.059 19.4783 45 19.5479V11.3391C38.9157 11.1304 34.1451 6.12173 34.1451 0Z"/>
                </svg>
              </a>
            </li>
          </FooterSocialGroup>

          {/* CineFiles socials */}
          <FooterSocialGroup
            label="cine/files"
            collapsed={cinefilesCollapsed}
            onToggle={() => handleToggle('cinefiles')}
            logoIcon={
              <svg className={styles.logoIcon} width="20" height="20" viewBox="0 0 800 640" fill="currentColor">
                <polygon points="709 126 709 127 514 608 152 608 176.5 584 181.48 581.98 499.84 581.84 683.89 126.59 709 126"/>
                <polygon points="88 619 72.41 587.15 0 604.99 42.5 563 148 563 89 619 88 619"/>
                <path d="M631,0l-61,58h118l-204,505H149l61-58h-118L296,0h335ZM663,81h-117.5c-41.97,39.17-84.34,78.04-125.5,118h117.5l125.5-118ZM512,222h-117.5l-125.5,118h117.5l125.5-118ZM362,363h-117.5c-41.91,39.23-84.33,78.05-125.5,118h117.5l125.5-118Z"/>
              </svg>
            }
          >
            <li>
              <a href="https://t.me/cinefiles_txt" target="_blank" rel="noopener noreferrer" className={styles.socialLink} title="Telegram (cine/files)">
                <svg viewBox="0 0 48 48" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M48 24C48 37.2548 37.2548 48 24 48C10.7452 48 0 37.2548 0 24C0 10.7452 10.7452 0 24 0C37.2548 0 48 10.7452 48 24ZM24.8601 17.7179C22.5257 18.6888 17.8603 20.6984 10.8638 23.7466C9.72766 24.1984 9.13251 24.6404 9.07834 25.0726C8.98677 25.803 9.90142 26.0906 11.1469 26.4822C11.3164 26.5355 11.4919 26.5907 11.6719 26.6492C12.8973 27.0475 14.5457 27.5135 15.4026 27.5321C16.1799 27.5489 17.0475 27.2284 18.0053 26.5707C24.5423 22.158 27.9168 19.9276 28.1286 19.8795C28.2781 19.8456 28.4852 19.803 28.6255 19.9277C28.7659 20.0524 28.7521 20.2886 28.7372 20.352C28.6466 20.7383 25.0562 24.0762 23.1982 25.8036C22.619 26.3421 22.2081 26.724 22.1242 26.8113C21.936 27.0067 21.7443 27.1915 21.56 27.3692C20.4215 28.4667 19.5678 29.2896 21.6072 30.6336C22.5873 31.2794 23.3715 31.8135 24.1539 32.3463C25.0084 32.9282 25.8606 33.5085 26.9632 34.2313C27.2442 34.4155 27.5125 34.6068 27.7738 34.7931C28.7681 35.5019 29.6615 36.1388 30.7652 36.0373C31.4065 35.9782 32.0689 35.3752 32.4053 33.5767C33.2004 29.3263 34.7633 20.1169 35.1244 16.3219C35.1561 15.9895 35.1163 15.5639 35.0843 15.3771C35.0523 15.1904 34.9855 14.9242 34.7427 14.7272C34.4552 14.4939 34.0113 14.4447 33.8127 14.4482C32.91 14.4641 31.5251 14.9456 24.8601 17.7179Z"/>
                </svg>
              </a>
            </li>
            <li>
              <a href="https://vk.com/cinefiles_txt" target="_blank" rel="noopener noreferrer" className={styles.socialLink} title="VK">
                <svg viewBox="0 0 48 48" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M3.37413 3.37413C0 6.74826 0 12.1788 0 23.04V24.96C0 35.8212 0 41.2517 3.37413 44.6259C6.74826 48 12.1788 48 23.04 48H24.96C35.8212 48 41.2517 48 44.6259 44.6259C48 41.2517 48 35.8212 48 24.96V23.04C48 12.1788 48 6.74826 44.6259 3.37413C41.2517 0 35.8212 0 24.96 0H23.04C12.1788 0 6.74826 0 3.37413 3.37413ZM8.10012 14.6001C8.36012 27.0801 14.6001 34.5801 25.5401 34.5801H26.1602V27.4401C30.1802 27.8401 33.22 30.7801 34.44 34.5801H40.1201C38.5601 28.9001 34.4599 25.7601 31.8999 24.5601C34.4599 23.0801 38.0599 19.4801 38.9199 14.6001H33.7598C32.6398 18.5601 29.3202 22.1601 26.1602 22.5001V14.6001H21V28.4401C17.8 27.6401 13.7601 23.7601 13.5801 14.6001H8.10012Z"/>
                </svg>
              </a>
            </li>
          </FooterSocialGroup>
        </div>
      </div>

      <div className={styles.metaNote}>
        &copy; {new Date().getFullYear()} CineFiles. Все права защищены.
      </div>
    </footer>
  );
}
