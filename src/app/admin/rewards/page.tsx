"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Gift,
  Plus,
  Edit,
  Trash2,
  ArrowLeft,
  Package,
  Tag,
  Image as ImageIcon,
  Loader2,
  ShoppingCart,
  Check,
  X,
  Clock,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import { isAdminAuthenticated } from "@/lib/authStorage";
import {
  rewardcategory,
  reward,
  createRewardCategory,
  getRewardCategories,
  updateRewardCategory,
  deleteRewardCategory,
  createReward,
  getRewards,
  updateReward,
  deleteReward,
  uploadRewardImage,
  deleteRewardImage,
} from "@/lib/rewardsappwrite.db";
import Image from "next/image";
import { Client, Databases, Query } from 'appwrite';

// Initialize Appwrite Client
const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || '')
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || '');

const databases = new Databases(client);

const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || '';
const REWARD_BUYING_COLLECTION_ID = process.env.NEXT_PUBLIC_APPWRITE_REWARD_BUYING_COLLECTION_ID || '';

interface RewardPurchase {
  $id: string;
  userId: string;
  username: string;
  categoryName: string;
  rewardname: string;
  price: number;
  image: string;
  status: 'pending' | 'approved' | 'rejected';
  $createdAt: string;
}

export default function AdminRewardsPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<rewardcategory[]>([]);
  const [products, setProducts] = useState<reward[]>([]);
  const [purchases, setPurchases] = useState<RewardPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("products");
  const [isCreatingReward, setIsCreatingReward] = useState(false);

  // Dialog states
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<rewardcategory | null>(
    null
  );
  const [editingProduct, setEditingProduct] = useState<reward | null>(null);

  // Form states
  const [categoryForm, setCategoryForm] = useState({
    category: "",
  });

  const [productForm, setProductForm] = useState({
    rewardname: "",
    categoryId: "",
    price: 0,
    imageFile: null as File | null,
  });

  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const categoriesData = await getRewardCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to fetch categories");
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      const productsData = await getRewards();
      setProducts(productsData);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products");
    }
  }, []);

  const fetchPurchases = useCallback(async () => {
    try {
      const purchasesData = await databases.listDocuments(
        DATABASE_ID,
        REWARD_BUYING_COLLECTION_ID,
        [Query.orderDesc('$createdAt')]
      );
      setPurchases(purchasesData.documents as unknown as RewardPurchase[]);
    } catch (error) {
      console.error("Error fetching purchases:", error);
      toast.error("Failed to fetch purchases");
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      await Promise.all([fetchCategories(), fetchProducts(), fetchPurchases()]);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("Failed to load rewards data");
    } finally {
      setLoading(false);
    }
  }, [fetchCategories, fetchProducts, fetchPurchases]);

  useEffect(() => {
    if (!isAdminAuthenticated()) {
      router.push("/admin/login");
      return;
    }

    fetchData();
  }, [router, fetchData]);

  const handlePurchaseStatusUpdate = async (purchaseId: string, status: 'approved' | 'rejected') => {
    try {
      const purchase = purchases.find(p => p.$id === purchaseId);
      if (!purchase) {
        toast.error("Purchase not found");
        return;
      }

      // Update purchase status
      await databases.updateDocument(
        DATABASE_ID,
        REWARD_BUYING_COLLECTION_ID,
        purchaseId,
        { status }
      );

      // If rejected, refund the user's balance
      if (status === 'rejected') {
        try {
          // First, try to find the user by userId in the signed up users collection
          const usersResponse = await databases.listDocuments(
            DATABASE_ID,
            process.env.NEXT_PUBLIC_APPWRITE_SIGNEDUP_COLLECTION_ID || '',
            [
              Query.equal('userId', purchase.userId) // Assuming the field in signedup collection is 'userId'
            ]
          );

          if (usersResponse.documents.length === 0) {
            // If not found by userId, try by username
            const usersByUsername = await databases.listDocuments(
              DATABASE_ID,
              process.env.NEXT_PUBLIC_APPWRITE_SIGNEDUP_COLLECTION_ID || '',
              [
                Query.equal('username', purchase.username)
              ]
            );

            if (usersByUsername.documents.length === 0) {
              console.error(`User not found with userId: ${purchase.userId} or username: ${purchase.username}`);
              toast.error("User not found - cannot process refund");
              return;
            }

            const userDoc = usersByUsername.documents[0];
            const currentBalance = userDoc.amount || 0;
            const newBalance = currentBalance + purchase.price;

            // Update user balance using the found document ID
            await databases.updateDocument(
              DATABASE_ID,
              process.env.NEXT_PUBLIC_APPWRITE_SIGNEDUP_COLLECTION_ID || '',
              userDoc.$id,
              { amount: newBalance }
            );
          } else {
            const userDoc = usersResponse.documents[0];
            const currentBalance = userDoc.amount || 0;
            const newBalance = currentBalance + purchase.price;

            // Update user balance using the found document ID
            await databases.updateDocument(
              DATABASE_ID,
              process.env.NEXT_PUBLIC_APPWRITE_SIGNEDUP_COLLECTION_ID || '',
              userDoc.$id,
              { amount: newBalance }
            );
          }
          
          toast.success(`Purchase rejected and ${purchase.price}$ refunded to user`);
        } catch (balanceError) {
          console.error("Failed to refund balance:", balanceError);
          toast.error("Purchase rejected but failed to refund balance");
        }
      } else {
        toast.success(`Purchase ${status} successfully`);
      }
      
      await fetchPurchases();
    } catch (error) {
      console.error("Failed to update purchase status:", error);
      toast.error("Failed to update purchase status");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="text-green-600 border-green-600"><Check className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="text-red-600 border-red-600"><X className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setProductForm({ ...productForm, imageFile: file });

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateCategory = async () => {
    try {
      if (!categoryForm.category.trim()) {
        toast.error("Category name is required");
        return;
      }

      await createRewardCategory({
        category: categoryForm.category,
      });

      await fetchCategories();
      setCategoryForm({ category: "" });
      setIsCategoryDialogOpen(false);
      toast.success("Category created successfully");
    } catch (error) {
      console.error("Failed to create category:", error);
      toast.error("Failed to create category");
    }
  };

  const handleUpdateCategory = async () => {
    try {
      if (!editingCategory) return;

      await updateRewardCategory(editingCategory.$id, {
        category: categoryForm.category,
      });

      await fetchCategories();
      setEditingCategory(null);
      setCategoryForm({ category: "" });
      setIsCategoryDialogOpen(false);
      toast.success("Category updated successfully");
    } catch (error) {
      console.error("Failed to update category:", error);
      toast.error("Failed to update category");
    }
  };

  const handleCreateProduct = async () => {
    try {
      if (!productForm.rewardname.trim() || !productForm.categoryId) {
        toast.error("Product name and category are required");
        return;
      }

      setIsCreatingReward(true);
      let imageUrl = "";

      // Upload image if provided
      if (productForm.imageFile) {
        const imageResponse = await uploadRewardImage(productForm.imageFile);
        imageUrl = imageResponse.$id;
      }

      const selectedCategory = categories.find(
        (cat) => cat.$id === productForm.categoryId
      );
      if (!selectedCategory) {
        toast.error("Selected category not found");
        return;
      }

      await createReward({
        rewardname: productForm.rewardname,
        categoryName: selectedCategory.category,
        price: productForm.price,
        image: imageUrl,
      });

      await fetchProducts();
      setProductForm({
        rewardname: "",
        categoryId: "",
        price: 0,
        imageFile: null,
      });
      setImagePreview(null);
      setIsProductDialogOpen(false);
      toast.success("Product created successfully");
    } catch (error) {
      console.error("Failed to create product:", error);
      toast.error("Failed to create product");
    } finally {
      setIsCreatingReward(false);
    }
  };

  const handleUpdateProduct = async () => {
    try {
      if (!editingProduct) return;

      setIsCreatingReward(true);
      let imageUrl = editingProduct.image;

      // Upload new image if provided
      if (productForm.imageFile) {
        // Delete old image if exists
        if (editingProduct.image) {
          await deleteRewardImage(editingProduct.image);
        }

        const imageResponse = await uploadRewardImage(productForm.imageFile);
        imageUrl = imageResponse.$id;
      }

      const selectedCategory = categories.find(
        (cat) => cat.$id === productForm.categoryId
      );
      if (!selectedCategory) {
        toast.error("Selected category not found");
        return;
      }

      await updateReward(editingProduct.$id, {
        rewardname: productForm.rewardname,
        categoryName: selectedCategory.category,
        price: productForm.price,
        image: imageUrl,
      });

      await fetchProducts();
      setEditingProduct(null);
      setProductForm({
        rewardname: "",
        categoryId: "",
        price: 0,
        imageFile: null,
      });
      setImagePreview(null);
      setIsProductDialogOpen(false);
      toast.success("Product updated successfully");
    } catch (error) {
      console.error("Failed to update product:", error);
      toast.error("Failed to update product");
    } finally {
      setIsCreatingReward(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      // Check if category is used by any products
      const categoryName = categories.find(
        (cat) => cat.$id === categoryId
      )?.category;
      const categoryInUse = products.some(
        (product) => product.categoryName === categoryName
      );
      if (categoryInUse) {
        toast.error("Cannot delete category that is being used by products");
        return;
      }

      if (!confirm("Are you sure you want to delete this category?")) return;

      await deleteRewardCategory(categoryId);
      await fetchCategories();
      toast.success("Category deleted successfully");
    } catch (error) {
      console.error("Failed to delete category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      if (!confirm("Are you sure you want to delete this product?")) return;

      const product = products.find((p) => p.$id === productId);

      // Delete image if exists
      if (product?.image) {
        await deleteRewardImage(product.image);
      }

      await deleteReward(productId);
      await fetchProducts();
      toast.success("Product deleted successfully");
    } catch (error) {
      console.error("Failed to delete product:", error);
      toast.error("Failed to delete product");
    }
  };

  const openEditCategory = (category: rewardcategory) => {
    setEditingCategory(category);
    setCategoryForm({
      category: category.category,
    });
    setIsCategoryDialogOpen(true);
  };

  const openEditProduct = (product: reward) => {
    setEditingProduct(product);
    // Find the category ID from the category name
    const category = categories.find(
      (cat) => cat.category === product.categoryName
    );
    setProductForm({
      rewardname: product.rewardname,
      categoryId: category?.$id || "",
      price: product.price,
      imageFile: null,
    });
    setImagePreview(null);
    setIsProductDialogOpen(true);
  };

  const resetForms = () => {
    setCategoryForm({ category: "" });
    setProductForm({
      rewardname: "",
      categoryId: "",
      price: 0,
      imageFile: null,
    });
    setImagePreview(null);
    setEditingCategory(null);
    setEditingProduct(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-custompink"></div>
      </div>
    );
  }

  const pendingPurchases = purchases.filter(p => p.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster />
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => router.push("/admin")}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin
            </Button>
            <div className="flex items-center gap-2">
              <Gift className="w-6 h-6 text-purple-500" />
              <h1 className="text-3xl font-bold text-gray-900">
                Rewards Management
              </h1>
            </div>
          </div>
          <Button
            onClick={fetchData}
            variant="outline"
            className="border-gray-300"
          >
            Refresh
          </Button>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Products ({products.length})
            </TabsTrigger>
            <TabsTrigger value="purchases" className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              Purchases ({purchases.length})
              {pendingPurchases > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs">
                  {pendingPurchases}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Categories ({categories.length})
            </TabsTrigger>
          </TabsList>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Reward Products
                </CardTitle>
                <Dialog
                  open={isProductDialogOpen}
                  onOpenChange={(open) => {
                    setIsProductDialogOpen(open);
                    if (!open) resetForms();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className="bg-purple-600 hover:bg-purple-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md bg-white text-black max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingProduct ? "Edit Product" : "Add New Product"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="product-name">Product Name *</Label>
                        <Input
                          id="product-name"
                          value={productForm.rewardname}
                          onChange={(e) =>
                            setProductForm({
                              ...productForm,
                              rewardname: e.target.value,
                            })
                          }
                          placeholder="Enter product name"
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label htmlFor="product-category">Category *</Label>
                        <Select
                          value={productForm.categoryId}
                          onValueChange={(value) =>
                            setProductForm({
                              ...productForm,
                              categoryId: value,
                            })
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem
                                key={category.$id}
                                value={category.$id}
                              >
                                {category.category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label htmlFor="price">Price *</Label>
                        <Input
                          id="price"
                          type="number"
                          value={productForm.price}
                          onChange={(e) =>
                            setProductForm({
                              ...productForm,
                              price: parseInt(e.target.value) || 0,
                            })
                          }
                          placeholder="0"
                          className="mt-1"
                          min="0"
                        />
                      </div>

                      <div>
                        <Label htmlFor="product-image">Product Image</Label>
                        <div className="mt-1 space-y-2">
                          <Input
                            id="product-image"
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                          />
                          {imagePreview && (
                            <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                              <Image
                                src={imagePreview}
                                alt="Preview"
                                width={128}
                                height={128}
                                className="object-cover"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsProductDialogOpen(false);
                            resetForms();
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={
                            editingProduct
                              ? handleUpdateProduct
                              : handleCreateProduct
                          }
                          className="bg-purple-600 hover:bg-purple-700"
                          disabled={isCreatingReward}
                        >
                          {isCreatingReward ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {editingProduct ? "Updating..." : "Creating..."}
                            </>
                          ) : (
                            <>{editingProduct ? "Update" : "Create"} Product</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <Card key={product.$id} className="overflow-hidden">
                      <div className="relative h-48 bg-gray-100">
                        {product.image ? (
                          <Image
                            src={`${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${process.env.NEXT_PUBLIC_APPWRITE_REWARD_BUCKET_ID}/files/${product.image}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}`}
                            alt={product.rewardname}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-12 h-12 text-gray-400" />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <h3 className="font-semibold text-lg">
                            {product.rewardname}
                          </h3>
                          <div className="flex justify-between items-center">
                            <Badge variant="outline">
                              {product.categoryName}
                            </Badge>
                            <span className="text-sm font-medium">
                              {product.price} $
                            </span>
                          </div>
                          <div className="flex justify-end items-center">
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditProduct(product)}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteProduct(product.$id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {products.length === 0 && (
                  <div className="text-center py-12">
                    <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No products found
                    </h3>
                    <p className="text-gray-600">
                      Create your first reward product to get started.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchases Tab */}
          <TabsContent value="purchases" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5" />
                  Reward Purchases
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((purchase) => (
                      <TableRow key={purchase.$id}>
                        <TableCell>
                          <div className="relative w-12 h-12 bg-gray-100 rounded-lg overflow-hidden">
                            {purchase.image ? (
                              <Image
                                src={`${process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT}/storage/buckets/${process.env.NEXT_PUBLIC_APPWRITE_REWARD_BUCKET_ID}/files/${purchase.image}/view?project=${process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID}`}
                                alt={purchase.rewardname}
                                fill
                                className="object-cover"
                                sizes="48px"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon className="w-6 h-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{purchase.username}</div>
                            <div className="text-sm text-gray-500">{purchase.userId}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{purchase.rewardname}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{purchase.categoryName}</Badge>
                        </TableCell>
                        <TableCell>{purchase.price}$</TableCell>
                        <TableCell>{getStatusBadge(purchase.status)}</TableCell>
                        <TableCell>
                          {new Date(purchase.$createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {purchase.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePurchaseStatusUpdate(purchase.$id, 'approved')}
                                className="text-green-600 hover:text-green-700"
                              >
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handlePurchaseStatusUpdate(purchase.$id, 'rejected')}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {purchases.length === 0 && (
                  <div className="text-center py-12">
                    <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No purchases found
                    </h3>
                    <p className="text-gray-600">
                      User purchases will appear here.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  Reward Categories
                </CardTitle>
                <Dialog
                  open={isCategoryDialogOpen}
                  onOpenChange={(open) => {
                    setIsCategoryDialogOpen(open);
                    if (!open) resetForms();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className="bg-blue-600 hover:bg-blue-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Category
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md bg-white text-black">
                    <DialogHeader>
                      <DialogTitle>
                        {editingCategory ? "Edit Category" : "Add New Category"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="category-name">Category Name *</Label>
                        <Input
                          id="category-name"
                          value={categoryForm.category}
                          onChange={(e) =>
                            setCategoryForm({
                              ...categoryForm,
                              category: e.target.value,
                            })
                          }
                          placeholder="Enter category name"
                          className="mt-1"
                        />
                      </div>

                      <div className="flex justify-end space-x-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setIsCategoryDialogOpen(false);
                            resetForms();
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={
                            editingCategory
                              ? handleUpdateCategory
                              : handleCreateCategory
                          }
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          {editingCategory ? "Update" : "Create"} Category
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Products</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.map((category) => {
                      const productCount = products.filter(
                        (p) => p.categoryName === category.category
                      ).length;
                      return (
                        <TableRow key={category.$id}>
                          <TableCell className="font-medium">
                            {category.category}
                          </TableCell>
                          <TableCell>{productCount} products</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditCategory(category)}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleDeleteCategory(category.$id)
                                }
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {categories.length === 0 && (
                  <div className="text-center py-12">
                    <Tag className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No categories found
                    </h3>
                    <p className="text-gray-600">
                      Create your first category to organize rewards.
                    </p>
                  </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }
