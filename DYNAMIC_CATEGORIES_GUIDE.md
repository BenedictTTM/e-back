# Dynamic Categories Implementation

## Architecture Explanation

This solution introduces a dynamic category management system using NestJS and Prisma, replacing hardcoded frontend categories.

### Why this architecture is best:

1.  **Database Normalization**: By moving categories to their own table (`Category`), we ensure data consistency. If a category name changes, it updates everywhere (if we rely on the relation).
2.  **Scalability**: The `Category` model can easily be extended with subcategories (self-relation), metadata, or hierarchy levels without breaking the product schema.
3.  **Flexibility**: Clients can manage categories via API without redeploying the frontend.
4.  **Performance**: We kept the `category` string field in the `Product` table for now. This is a "denormalization" strategy often used in high-read systems to avoid expensive JOINs during simple product listings, while the `categoryId` ensures referential integrity.

### Category-Product Relationships

- **One-to-Many**: A Category has many Products. A Product belongs to one Category (via `categoryId`).
- **Referential Integrity**: The `categoryId` foreign key ensures that a product cannot be assigned to a non-existent category.
- **Fallback**: The code logic ensures that if a `categoryId` is provided, we validate it and fetch the correct name, maintaining synchronization between the relational ID and the denormalized string name.

### How to scale this later:

1.  **Subcategories**: Add a `parentId` field to the `Category` model that references `Category.id`. This creates a tree structure.
2.  **Tagging**: Create a `Tag` model and a many-to-many relation with `Product` (e.g., `ProductTags` join table) for more granular filtering (e.g., "Summer", "Vintage").
3.  **Caching**: Implement Redis caching for the `GET /categories` endpoint since category trees rarely change but are read frequently.

## API Endpoints

### Categories

- `POST /categories`: Create a new category (Admin only).
- `GET /categories`: List all categories with product counts.
- `GET /categories/:id`: Get details of a specific category.
- `PATCH /categories/:id`: Update a category (Admin only).
- `DELETE /categories/:id`: Delete a category (Admin only).

### Products

- `POST /products`: Now accepts `categoryId`. If provided, it validates the category and links the product.
