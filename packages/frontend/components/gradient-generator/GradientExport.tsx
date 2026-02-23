/**
 * CSS Gradient Generator - Gradient Export Component
 */

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Download, Code } from 'lucide-react';
import { generateGradientCSS, downloadCSS, copyToClipboard } from './utils';
import type { GradientExportProps } from './types';

export function GradientExport({
  config,
  exportOptions,
  onExportOptionsChange,
  onCopy,
  onDownload,
  className,
}: GradientExportProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const css = generateGradientCSS(config, exportOptions);

  const handleCopy = async () => {
    const success = await copyToClipboard(css);
    if (success) {
      setCopied(true);
      onCopy?.(css);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    downloadCSS(css, 'gradient.css');
    onDownload?.(css, 'gradient.css');
  };

  const handleFormatChange = (format: 'standard' | 'shorthand' | 'legacy') => {
    onExportOptionsChange({ ...exportOptions, format });
  };

  const handleIncludePrefixesChange = (includePrefixes: boolean) => {
    onExportOptionsChange({ ...exportOptions, includePrefixes });
  };

  const handleIncludeCommentsChange = (includeComments: boolean) => {
    onExportOptionsChange({ ...exportOptions, includeComments });
  };

  return (
    <div className={cn('gradient-export space-y-4', className)}>
      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={handleCopy}
          aria-label="Copy CSS to clipboard"
        >
          <Copy className="w-4 h-4 mr-2" />
          {copied ? 'Copied!' : 'Copy CSS'}
        </Button>
        <Button
          type="button"
          variant="default"
          className="flex-1"
          onClick={handleDownload}
          aria-label="Download CSS file"
        >
          <Download className="w-4 h-4 mr-2" />
          Download
        </Button>
      </div>

      {/* View Code Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" className="w-full">
            <Code className="w-4 h-4 mr-2" />
            View CSS Code
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CSS Gradient Code</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Export Options */}
            <div className="space-y-3">
              <Label>Export Options</Label>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="format-select" className="text-sm text-muted-foreground">
                    Format
                  </Label>
                  <Select value={exportOptions.format} onValueChange={handleFormatChange}>
                    <SelectTrigger id="format-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="shorthand">Shorthand</SelectItem>
                      <SelectItem value="legacy">Legacy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportOptions.includePrefixes}
                    onChange={(e) => handleIncludePrefixesChange(e.target.checked)}
                    className="w-4 h-4 rounded border-input"
                    aria-label="Include vendor prefixes"
                  />
                  <span className="text-sm">Include vendor prefixes</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportOptions.includeComments}
                    onChange={(e) => handleIncludeCommentsChange(e.target.checked)}
                    className="w-4 h-4 rounded border-input"
                    aria-label="Include comments"
                  />
                  <span className="text-sm">Include comments</span>
                </label>
              </div>
            </div>

            {/* CSS Code Display */}
            <div className="space-y-2">
              <Label htmlFor="css-code">CSS Code</Label>
              <Textarea
                id="css-code"
                value={css}
                readOnly
                className="font-mono text-sm min-h-[200px]"
                aria-label="Generated CSS code"
              />
            </div>

            {/* Dialog Actions */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleCopy}
              >
                <Copy className="w-4 h-4 mr-2" />
                {copied ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                type="button"
                variant="default"
                className="flex-1"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GradientExport;
