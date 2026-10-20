import React from 'react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <p>
          &copy; {new Date().getFullYear()} <strong>RetailSphere</strong> &mdash; Inventory &amp; Sales Analytical System &bull; Professional Edition
        </p>
      </div>
    </footer>
  );
}

