import { useEffect, useState } from 'react';

export interface Route {
  section: string;
  page?: string;
}

const parse = (): Route => {
  const [section = '', page] = location.hash.replace(/^#\/?/, '').split('/');
  return { section, page: page || undefined };
};

export function useRoute() {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => {
      setR(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const href = (section: string, page?: string) => `#/${section}${page ? '/' + page : ''}`;
