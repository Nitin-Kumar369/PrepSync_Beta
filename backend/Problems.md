Problems with the project and next things to do:
1. The very first problem is the /chat endpoint. It should not exist, its useless. The functionality where user can access previous chats is implemented in this endpoint only, meanwhile user can only chat with books at chat/book_code endpoint only, where that functionality doesnt exist. So, the sole /chat endpoint should not be accessible and all functionalities wasted on it must be moved ot /chat/book_code endpoints
2. The second problem is that there is no way for admin to upload books as of now. 

Read "project_implementation_requirements.txt" to see how these problematic implementations must work