import { Star } from 'lucide-react'
import React from 'react'

import { Container, Links, Link } from './styles'

export const Footer: React.FC = () => {
  return (
    <Container>
      <Links>
        <Link rel="noreferrer" target="_blank" href="https://github.com/haichteque/dont-show-me">
          <Star size={15} /> Star on GitHub
        </Link>
      </Links>
    </Container>
  )
}
