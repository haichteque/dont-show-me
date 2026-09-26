import React from 'react'
import styled from 'styled-components'

const LogoTile = styled.div<{ $size: number }>`
  width: ${props => props.$size}px;
  height: ${props => props.$size}px;
  border-radius: 8px;
  background-color: ${props => props.theme.bg.surface};
  border: 1px solid ${props => props.theme.border};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.accent};
  flex: none;
  transition: all 0.2s ease-in-out;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

  svg {
    width: ${props => Math.round(props.$size * 0.7)}px;
    height: ${props => Math.round(props.$size * 0.7)}px;
    color: ${props => props.theme.accent};
    transition: color 0.2s ease-in-out;
  }
`

export const Logo: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <LogoTile $size={size} role="img" aria-label="DontShowMe">
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Person torso turning away */}
      <path d="M4 21v-1a6 6 0 0 1 7-5.9" />
      {/* Head looking away */}
      <circle cx="11" cy="7.5" r="3.5" />
      {/* Arm and hand shielding gaze / eyes */}
      <path d="M19 21l-1.5-6-3.5-3" />
      <path d="M14 12l2.5-3" />
      <path d="M16.5 9l2.5-1.5" />
    </svg>
  </LogoTile>
)
