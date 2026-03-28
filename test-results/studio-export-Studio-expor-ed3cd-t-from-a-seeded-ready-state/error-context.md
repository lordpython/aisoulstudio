# Page snapshot

```yaml
- alert [ref=e3]:
  - img [ref=e5]
  - heading "Something went wrong" [level=2] [ref=e7]
  - paragraph [ref=e8]: An unexpected error occurred. You can try again or refresh the page.
  - group [ref=e9]:
    - generic "Error details" [ref=e10] [cursor=pointer]
  - paragraph [ref=e11]:
    - text: "Reference:"
    - code [ref=e12]: ERR-MN9XR766-L9W6
  - generic [ref=e13]:
    - button "Try Again" [ref=e14]
    - button "Refresh Page" [ref=e15]
```